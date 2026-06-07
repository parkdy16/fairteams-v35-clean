import { Gender } from "@/lib/types";

export interface RoomPlayer {
  id: string;
  roomId: number;
  name: string;
  gender: Gender;
  skill: number;       // computed overall 0-10
  attack: number;      // 1-10
  defense: number;     // 1-10
  speed: number;       // 1-10
  passing: number;     // 1-10
  stamina: number;     // 1-10
  physical: number;    // 1-10
  teamPlay: number;    // 1-3 (low / average / high)
  profilePhoto?: string;
  isGoalkeeper?: boolean;
  isOrganizer?: boolean;
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

export function calculateOverall(player: Partial<RoomPlayer>) {
  const attack = clamp(player.attack, 1, 10, clamp(player.skill, 0, 10, 5));
  const defense = clamp(player.defense, 1, 10, clamp(player.skill, 0, 10, 5));
  const speed = clamp(player.speed, 1, 10, 5);
  const passing = clamp(player.passing, 1, 10, clamp(player.skill, 0, 10, 5));
  const stamina = clamp(player.stamina, 1, 10, 5);
  const physical = clamp(player.physical, 1, 10, 5);
  const teamPlay = clamp(player.teamPlay, 1, 3, 2);

  const baseOverall = (attack + defense + speed + passing + stamina + physical) / 6;
  const teamPlayMultiplier = teamPlay === 1 ? 0.8 : teamPlay === 3 ? 1.2 : 1.0;
  return Math.round(baseOverall * teamPlayMultiplier * 10) / 10;
}

export function normalizePlayer(player: Partial<RoomPlayer> & { name?: string }, index = 0): RoomPlayer {
  const baseSkill = clamp(player.skill, 0, 10, 5);
  const normalized: RoomPlayer = {
    id: player.id || createLocalPlayerId(),
    roomId: 1,
    name: (player.name || `Player ${index + 1}`).trim(),
    gender: player.gender === "female" || player.gender === "other" ? player.gender : "male",
    skill: baseSkill,
    attack: clamp(player.attack, 1, 10, baseSkill || 5),
    defense: clamp(player.defense, 1, 10, baseSkill || 5),
    speed: clamp(player.speed, 1, 10, 5),
    passing: clamp(player.passing, 1, 10, baseSkill || 5),
    stamina: clamp(player.stamina, 1, 10, 5),
    physical: clamp(player.physical, 1, 10, 5),
    teamPlay: clamp(player.teamPlay, 1, 3, 2),
    profilePhoto: typeof player.profilePhoto === "string" ? player.profilePhoto : undefined,
    isGoalkeeper: Boolean(player.isGoalkeeper ?? false),
    isOrganizer: Boolean(player.isOrganizer ?? false),
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
  const headers = ["name", "gender", "overall", "attack", "defense", "speed", "passing", "stamina", "strength", "teamPlay", "isGoalkeeper", "isOrganizer", "attending"];
  const rows = players.map(p => [p.name, p.gender, p.skill, p.attack, p.defense, p.speed, p.passing, p.stamina, p.physical, p.teamPlay, p.isGoalkeeper ? "yes" : "no", p.isOrganizer ? "yes" : "no", p.attending ? "yes" : "no"]);
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
      gender: get("gender") as Gender,
      skill,
      attack: Number(get("attack") || skill),
      defense: Number(get("defense") || skill),
      speed: Number(get("speed") || 5),
      passing: Number(get("passing") || skill),
      stamina: Number(get("stamina") || 5),
      physical: Number(get("strength") || get("physical") || 5),
      teamPlay: Number(get("teamplay") || get("teamPlay") || get("weakfoot") || get("weakFoot") || 2),
      isGoalkeeper: parseBoolean(get("isgoalkeeper") || get("goalkeeper") || get("gk")),
      isOrganizer: parseBoolean(get("isorganizer") || get("organizer") || get("org")),
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
