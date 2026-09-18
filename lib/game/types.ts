export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export interface Settings {
  rounds: number;
  drawTime: number; // seconds
  difficulty: Difficulty;
  maxPlayers: number;
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: 3,
  drawTime: 80,
  difficulty: "mixed",
  maxPlayers: 12,
};

export const LIMITS = {
  rounds: { min: 1, max: 10 },
  drawTime: { min: 30, max: 180 },
  maxPlayers: { min: 2, max: 16 },
  nameLength: 16,
  guessLength: 60,
  chatHistory: 60,
} as const;

export const CHOOSE_TIME_MS = 15_000;
export const TURN_END_MS = 6_000;
export const AVATAR_COUNT = 8;

export interface Player {
  id: string;
  name: string;
  avatar: number; // 0..AVATAR_COUNT-1
  score: number;
  connected: boolean;
  connId: string | null;
  joinedAt: number;
  lastSeen: number;
}

export type Phase = "lobby" | "choosing" | "drawing" | "turn_end" | "game_over";

export interface Hint {
  at: number; // absolute ms timestamp when this hint becomes visible
  index: number; // character index revealed
}

export interface Turn {
  id: string;
  round: number;
  drawerId: string;
  choices: string[];
  word: string | null;
  hints: Hint[];
  hintsShown: number;
  /** playerId -> points awarded for a correct guess */
  guessed: Record<string, number>;
  drawStartedAt: number | null;
  drawEndsAt: number | null;
}

export interface TurnSummary {
  word: string;
  drawerId: string;
  drawerPoints: number;
  guesserPoints: Record<string, number>;
  reason: "all_guessed" | "timeout" | "drawer_left";
}

export type ChatKind = "chat" | "system" | "correct" | "close" | "join" | "leave";
export type ChatVisibility = "all" | "guessed" | "private";

export interface ChatMessage {
  id: string;
  playerId: string | null;
  name: string;
  text: string;
  kind: ChatKind;
  visibility: ChatVisibility;
  /** recipient for private messages */
  to?: string;
  ts: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  settings: Settings;
  players: Player[];
  /** playerId -> secret token; NEVER sent to clients (stripped by redact) */
  secrets: Record<string, string>;
  phase: Phase;
  phaseId: number;
  phaseEndsAt: number | null;
  round: number;
  drawOrder: string[];
  turnIndex: number;
  turn: Turn | null;
  lastTurn: TurnSummary | null;
  usedWords: string[];
  chat: ChatMessage[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

// ---- Actions (client -> server) ----

export type Action =
  | { type: "leave" }
  | { type: "kick"; targetId: string }
  | { type: "update_settings"; settings: Partial<Settings> }
  | { type: "start" }
  | { type: "choose_word"; index: number }
  | { type: "guess"; text: string }
  | { type: "tick" }
  | { type: "play_again" }
  | { type: "connect"; connId: string }
  | { type: "disconnect"; connId: string };

export type ActionType = Action["type"];

// ---- Drawing ----

export type StrokeOp =
  | { t: "seg"; id: string; color: string; size: number; pts: number[] }
  | { t: "undo"; id: string }
  | { t: "clear" };

export interface DrawBatch {
  turnId: string;
  from: string;
  ops: StrokeOp[];
}

// ---- Client view (redacted) ----

export interface PlayerView {
  id: string;
  name: string;
  avatar: number;
  score: number;
  connected: boolean;
}

export interface TurnView {
  id: string;
  round: number;
  drawerId: string;
  /** only present for the drawer during "choosing" */
  choices?: string[];
  /** full word: only for the drawer, players who guessed, or after the turn ends */
  word?: string;
  /** masked word with revealed hints, e.g. "_ a _ _ e" as array of chars (null = hidden) */
  mask: (string | null)[];
  /** absolute timestamps of upcoming hints (so clients know when to tick) */
  hintTimes: number[];
  guessed: string[];
  drawEndsAt: number | null;
}

export interface RoomView {
  code: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  phase: Phase;
  phaseId: number;
  phaseEndsAt: number | null;
  round: number;
  turn: TurnView | null;
  lastTurn: TurnSummary | null;
  chat: ChatMessage[];
  version: number;
  /** the viewer's own id */
  me: string;
  serverNow: number;
}

// ---- Realtime events (server -> client over SSE) ----

export type ServerEvent =
  | { type: "snapshot"; room: RoomView; strokes: StrokeOp[]; turnId: string | null }
  | { type: "state"; room: RoomView }
  | { type: "stroke"; batch: DrawBatch }
  | { type: "kicked" }
  | { type: "error"; message: string };

/** message published on the Redis channel for a room */
export type BusMessage =
  | { type: "state"; state: RoomState }
  | { type: "stroke"; batch: DrawBatch };

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
