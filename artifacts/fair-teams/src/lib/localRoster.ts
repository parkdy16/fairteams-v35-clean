import { FieldSize, Gender } from "@/lib/types";

export interface RoomPlayer {
  id: string;
  roomId: number;
  name: string;
  aka?: string;
  gender: Gender;
  skill: number;       // computed overall 0-10
  attack: number;      // 1-10
  defense: number;     // 1-10
  speed: number;       // 1-10
  passing: number;     // 1-10
  stamina: number;     // 1-10
  physical: number;    // 1-10
  teamPlay: number;    // 1-3 (low / average / high)
  specialAbility?: string;
  specialAbilities?: string[];
  profilePhoto?: string;
  isGoalkeeper?: boolean;
  isOrganizer?: boolean;
  isNew?: boolean;
  attending: boolean;
  createdAt: string;
}

const STORAGE_KEY = "fair-teams-local-roster-v1-profiles";
const LEGACY_STORAGE_KEY = "lazy-lousy-local-roster-v2-profiles";
const LEGACY_STORAGE_KEY_V1 = "lazy-lousy-local-roster-v1";

function createLocalPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(num: unknown, min: number, max: number, fallback: number) {
  const n = Number(num);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const SPECIAL_ABILITY_BONUSES: Record<string, Partial<Record<"attack" | "defense" | "speed" | "passing" | "stamina" | "physical", number>>> = {
  playmaker: { passing: 0.7, attack: 0.3 },
  sentinel: { defense: 0.8, physical: 0.2 },
  finisher: { attack: 0.8, passing: 0.2 },
  engine: { stamina: 0.7, speed: 0.3 },
  speedster: { speed: 0.8, attack: 0.2 },
};

function clampRating(num: unknown, fallback = 5) {
  const n = Number(num);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(1, n));
}

function specialAbilityNames(player: Partial<RoomPlayer>) {
  const names = [
    player.specialAbility,
    ...(Array.isArray(player.specialAbilities) ? player.specialAbilities : []),
  ];

  return names
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map(name => name.trim().toLowerCase());
}

export function getImpactAttributes(player: Partial<RoomPlayer>) {
  const baseSkill = clamp(player.skill, 0, 10, 5) || 5;
  const attrs = {
    attack: clampRating(player.attack, baseSkill),
    defense: clampRating(player.defense, baseSkill),
    speed: clampRating(player.speed, 5),
    passing: clampRating(player.passing, baseSkill),
    stamina: clampRating(player.stamina, 5),
    physical: clampRating(player.physical, 5),
  };

  // Special abilities are small team-balancing nudges, not fake superstar bonuses.
  // Goalkeeper is intentionally handled as a team-spreading role, not an OVA boost.
  specialAbilityNames(player).forEach(name => {
    if (name === "goalkeeper" || name === "gk") return;
    const bonus = SPECIAL_ABILITY_BONUSES[name];
    if (!bonus) return;
    Object.entries(bonus).forEach(([key, value]) => {
      const stat = key as keyof typeof attrs;
      attrs[stat] = Math.min(10, attrs[stat] + (value ?? 0));
    });
  });

  return attrs;
}

export function calculateOverall(player: Partial<RoomPlayer>) {
  const attrs = getImpactAttributes(player);
  const teamPlay = clamp(player.teamPlay, 1, 3, 2);

  // Casual football impact without positions: reward balance and penalize one-way players.
  const weighted =
    // Casual football OVA: technique, pace, and two-way usefulness matter more than strength.
    attrs.passing * 0.22 +
    attrs.attack * 0.21 +
    attrs.defense * 0.20 +
    attrs.speed * 0.20 +
    attrs.stamina * 0.12 +
    attrs.physical * 0.05;

  const values = Object.values(attrs);
  const weakest = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const weaknessPenalty = Math.max(0, average - weakest - 1.5) * 0.22;
  const teamPlayAdjustment = teamPlay === 1 ? -0.4 : teamPlay === 3 ? 0.35 : 0;

  const overall = Math.min(10, Math.max(1, weighted - weaknessPenalty + teamPlayAdjustment));
  return Math.round(overall * 10) / 10;
}

export function calculateBalanceScore(player: Partial<RoomPlayer>, fieldSize: FieldSize = "medium") {
  const attrs = getImpactAttributes(player);
  const weights = fieldSize === "small"
    ? { attack: 0.22, passing: 0.26, defense: 0.20, speed: 0.20, stamina: 0.08, physical: 0.04 }
    : fieldSize === "large"
      ? { attack: 0.16, passing: 0.19, defense: 0.23, speed: 0.18, stamina: 0.20, physical: 0.04 }
      : { attack: 0.20, passing: 0.22, defense: 0.22, speed: 0.20, stamina: 0.12, physical: 0.04 };

  const score =
    attrs.attack * weights.attack +
    attrs.passing * weights.passing +
    attrs.defense * weights.defense +
    attrs.speed * weights.speed +
    attrs.stamina * weights.stamina +
    attrs.physical * weights.physical;

  const teamPlay = clamp(player.teamPlay, 1, 3, 2);
  const adjustment = teamPlay === 1 ? -0.25 : teamPlay === 3 ? 0.2 : 0;
  return Math.round(Math.min(10, Math.max(1, score + adjustment)) * 10) / 10;
}

export function normalizePlayer(player: Partial<RoomPlayer> & { name?: string }, index = 0): RoomPlayer {
  const baseSkill = clamp(player.skill, 0, 10, 5);
  const normalized: RoomPlayer = {
    id: player.id || createLocalPlayerId(),
    roomId: 1,
    name: (player.name || `Player ${index + 1}`).trim(),
    aka: typeof player.aka === "string" && player.aka.trim() ? player.aka.trim() : undefined,
    gender: player.gender === "female" || player.gender === "other" ? player.gender : "male",
    skill: baseSkill,
    attack: clamp(player.attack, 1, 10, baseSkill || 5),
    defense: clamp(player.defense, 1, 10, baseSkill || 5),
    speed: clamp(player.speed, 1, 10, 5),
    passing: clamp(player.passing, 1, 10, baseSkill || 5),
    stamina: clamp(player.stamina, 1, 10, 5),
    physical: clamp(player.physical, 1, 10, 5),
    teamPlay: clamp(player.teamPlay, 1, 3, 2),
    specialAbility: typeof player.specialAbility === "string" && player.specialAbility.trim() ? player.specialAbility.trim() : undefined,
    specialAbilities: Array.isArray(player.specialAbilities) ? player.specialAbilities.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map(value => value.trim()) : undefined,
    profilePhoto: typeof player.profilePhoto === "string" ? player.profilePhoto : undefined,
    isGoalkeeper: Boolean(player.isGoalkeeper ?? false),
    isOrganizer: Boolean(player.isOrganizer ?? false),
    isNew: Boolean(player.isNew ?? false),
    attending: Boolean(player.attending ?? false),
    createdAt: player.createdAt || new Date().toISOString(),
  };
  normalized.skill = calculateOverall(normalized);
  return normalized;
}

export function loadPlayers(): RoomPlayer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY_V1);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p, i) => normalizePlayer(p, i)).filter(p => p.name);
  } catch {
    return [];
  }
}

export function savePlayers(players: RoomPlayer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players.map((p, i) => normalizePlayer(p, i))));
  } catch (error) {
    console.error("Could not save Fair Teams roster locally.", error);
  }
}

export function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function playersToCsv(players: RoomPlayer[]) {
  const headers = ["name", "aka", "gender", "overall", "attack", "defense", "speed", "passing", "stamina", "strength", "teamPlay", "specialAbility", "isGoalkeeper", "isOrganizer", "isNew", "attending"];
  const rows = players.map(p => [p.name, p.aka || "", p.gender, p.skill, p.attack, p.defense, p.speed, p.passing, p.stamina, p.physical, p.teamPlay, p.specialAbility || (p.specialAbilities || []).join("|"), p.isGoalkeeper ? "yes" : "no", p.isOrganizer ? "yes" : "no", p.isNew ? "yes" : "no", p.attending ? "yes" : "no"]);
  return [headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseBoolean(value: string | undefined) {
  const v = (value || "").toLowerCase().trim();
  return v === "true" || v === "yes" || v === "1" || v === "y";
}

export function csvToPlayers(csvText: string): RoomPlayer[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const hasHeader = first.includes("name") || first.includes("skill") || first.includes("gender") || first.includes("attack");
  const headers = hasHeader ? first : ["name", "gender", "skill", "speed", "attending"];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, index) => {
    const cells = parseCsvLine(line);
    const get = (key: string) => cells[headers.indexOf(key.toLowerCase())] ?? "";
    const skill = Number(get("overall") || get("skill") || 5);
    return normalizePlayer({
      name: get("name") || cells[0],
      aka: get("aka") || get("nickname"),
      gender: get("gender") as Gender,
      skill,
      attack: Number(get("attack") || skill),
      defense: Number(get("defense") || skill),
      speed: Number(get("speed") || 5),
      passing: Number(get("passing") || skill),
      stamina: Number(get("stamina") || 5),
      physical: Number(get("strength") || get("physical") || 5),
      teamPlay: Number(get("teamplay") || get("teamPlay") || get("weakfoot") || get("weakFoot") || 2),
      specialAbility: get("specialability") || get("ability") || get("special"),
      isGoalkeeper: parseBoolean(get("isgoalkeeper") || get("goalkeeper") || get("gk")),
      isOrganizer: parseBoolean(get("isorganizer") || get("organizer") || get("org")),
      isNew: parseBoolean(get("isnew") || get("new")),
      attending: parseBoolean(get("attending")),
    }, index);
  }).filter(p => p.name);
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
