import { FieldSize, Player, Team, TeamColor } from "./types";

const DEFAULT_COLORS: TeamColor[] = ["red", "blue", "lime", "yellow", "orange", "black"];

function specialAbilityBonus(player: Player) {
  let bonus = 0;
  if (player.isPlaymaker) bonus += 0.3;
  if (player.isFinisher) bonus += 0.3;
  if (player.isSentinel) bonus += 0.3;
  if (player.isDribbler) bonus += 0.2;
  if (player.isEngine) bonus += 0.2;
  if (player.isVersatile) bonus += 0.2;
  return Math.min(0.7, bonus);
}

export function getWeightedSkill(player: Player, fieldSize: FieldSize = "medium") {
  const weights = fieldSize === "small"
    ? { attack: 0.22, passing: 0.26, defense: 0.20, speed: 0.20, stamina: 0.08, physical: 0.04 }
    : { attack: 0.22, passing: 0.20, defense: 0.22, speed: 0.20, stamina: 0.12, physical: 0.04 };

  const base =
    player.attack * weights.attack +
    player.passing * weights.passing +
    player.defense * weights.defense +
    player.speed * weights.speed +
    player.stamina * weights.stamina +
    player.physical * weights.physical;

  const teamPlayMultiplier = player.teamPlay === 1 ? 0.93 : player.teamPlay === 3 ? 1.07 : 1.0;
  return Number(Math.min(10, base * teamPlayMultiplier + specialAbilityBonus(player)).toFixed(1));
}

function targetSizes(totalPlayers: number, numTeams: number) {
  const base = Math.floor(totalPlayers / numTeams);
  const extra = totalPlayers % numTeams;
  return Array.from({ length: numTeams }, (_, index) => base + (index < extra ? 1 : 0));
}

function teamSkill(team: Team, fieldSize: FieldSize) {
  return team.players.reduce((sum, p) => sum + getWeightedSkill(p, fieldSize), 0);
}

function balanceSpread(teams: Team[], fieldSize: FieldSize) {
  teams.forEach(t => {
    t.totalSkill = Number(teamSkill(t, fieldSize).toFixed(1));
    t.averageSkill = t.players.length > 0 ? Number((t.totalSkill / t.players.length).toFixed(1)) : 0;
  });
}

type BalanceRole = "gk" | "female" | "playmaker" | "finisher" | "sentinel";

function roleCount(team: Team, role: BalanceRole) {
  if (role === "gk") return team.players.filter(p => p.isGoalkeeper).length;
  if (role === "female") return team.players.filter(p => p.gender === "female").length;
  if (role === "playmaker") return team.players.filter(p => p.isPlaymaker).length;
  if (role === "finisher") return team.players.filter(p => p.isFinisher).length;
  return team.players.filter(p => p.isSentinel).length;
}

function maxMinTotalDiff(teams: Team[], fieldSize: FieldSize) {
  const totals = teams.map(t => teamSkill(t, fieldSize));
  return Math.max(...totals) - Math.min(...totals);
}

export function generateTeams(
  players: Player[],
  numTeams: number,
  shuffleEquals: boolean = false,
  fieldSize: FieldSize = "medium"
): Team[] {
  if (numTeams < 2 || players.length === 0) return [];

  const safeNumTeams = Math.min(numTeams, Math.max(2, players.length));
  const sizes = targetSizes(players.length, safeNumTeams);

  const teams: Team[] = Array.from({ length: safeNumTeams }, (_, i) => ({
    id: String(i + 1),
    name: `Team ${i + 1}`,
    players: [],
    totalSkill: 0,
    averageSkill: 0,
    color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  const noise = new Map(
    players.map(p => [p.id, shuffleEquals ? (Math.random() - 0.5) * 0.99 : 0])
  );

  const weighted = (p: Player) => getWeightedSkill(p, fieldSize);
  const sortStrongFirst = (a: Player, b: Player) => (weighted(b) + (noise.get(b.id) ?? 0)) - (weighted(a) + (noise.get(a.id) ?? 0));

  const addPlayer = (team: Team, player: Player) => {
    team.players.push(player);
    team.totalSkill = Number((team.totalSkill + weighted(player)).toFixed(1));
    team.averageSkill = team.players.length > 0 ? Number((team.totalSkill / team.players.length).toFixed(1)) : 0;
  };

  const hasRoom = (teamIndex: number) => teams[teamIndex]!.players.length < sizes[teamIndex]!;

  const chooseTeamForRole = (role: BalanceRole) => {
    return teams
      .map((team, index) => ({ team, index }))
      .filter(({ index }) => hasRoom(index))
      .sort((a, b) =>
        roleCount(a.team, role) - roleCount(b.team, role) ||
        a.team.players.length - b.team.players.length ||
        a.team.totalSkill - b.team.totalSkill
      )[0];
  };

  const chooseTeamForPlayer = (player: Player) => {
    const eligible = teams
      .map((team, index) => ({ team, index }))
      .filter(({ index }) => hasRoom(index));

    const candidates = eligible.length > 0 ? eligible : teams.map((team, index) => ({ team, index }));

    return candidates.sort((a, b) => {
      const aProjected = a.team.totalSkill + weighted(player);
      const bProjected = b.team.totalSkill + weighted(player);
      return aProjected - bProjected || a.team.players.length - b.team.players.length;
    })[0];
  };

  const assigned = new Set<string>();

  const assignBucket = (bucket: Player[], role: BalanceRole) => {
    bucket.sort(sortStrongFirst).forEach(player => {
      if (assigned.has(player.id)) return;
      const selected = chooseTeamForRole(role);
      if (!selected) return;
      addPlayer(selected.team, player);
      assigned.add(player.id);
    });
  };

  // Important role spread first: keep goalkeepers, female players and key special abilities apart where possible.
  assignBucket(players.filter(p => p.isGoalkeeper), "gk");
  assignBucket(players.filter(p => p.gender === "female"), "female");
  assignBucket(players.filter(p => p.isPlaymaker), "playmaker");
  assignBucket(players.filter(p => p.isFinisher), "finisher");
  assignBucket(players.filter(p => p.isSentinel), "sentinel");

  // Then distribute everyone else by weighted strength while respecting target team sizes.
  players
    .filter(p => !assigned.has(p.id))
    .sort(sortStrongFirst)
    .forEach(player => {
      const selected = chooseTeamForPlayer(player);
      if (!selected) return;
      addPlayer(selected.team, player);
      assigned.add(player.id);
    });

  // Simple swap optimizer: keep team sizes fixed, improve total-strength spread.
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;

    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        const a = teams[i]!;
        const b = teams[j]!;
        const before = maxMinTotalDiff(teams, fieldSize);

        for (let ai = 0; ai < a.players.length; ai += 1) {
          for (let bi = 0; bi < b.players.length; bi += 1) {
            const playerA = a.players[ai]!;
            const playerB = b.players[bi]!;

            // Avoid undoing the most important role balancing unless both players share that role type.
            if (Boolean(playerA.isGoalkeeper) !== Boolean(playerB.isGoalkeeper)) continue;
            if ((playerA.gender === "female") !== (playerB.gender === "female")) continue;

            a.players[ai] = playerB;
            b.players[bi] = playerA;
            const after = maxMinTotalDiff(teams, fieldSize);

            if (after + 0.05 < before) {
              improved = true;
              balanceSpread(teams, fieldSize);
            } else {
              a.players[ai] = playerA;
              b.players[bi] = playerB;
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  balanceSpread(teams, fieldSize);
  return teams;
}

export function recomputeStats(teams: Team[], fieldSize: FieldSize = "medium"): Team[] {
  return teams.map(t => {
    const totalSkill = Number(t.players.reduce((sum, p) => sum + getWeightedSkill(p, fieldSize), 0).toFixed(1));
    return {
      ...t,
      totalSkill,
      averageSkill:
        t.players.length > 0
          ? Number((totalSkill / t.players.length).toFixed(1))
          : 0,
    };
  });
}
