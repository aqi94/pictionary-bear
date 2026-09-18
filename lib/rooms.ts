import { getStore } from "./redis";
import { reduce } from "./game/engine";
import { GameError, type Action, type BusMessage, type DrawBatch, type RoomState, type StrokeOp } from "./game/types";

export const ROOM_TTL_SEC = 6 * 60 * 60;
export const STROKES_TTL_SEC = 60 * 60;
const LOCK_TTL_MS = 3000;
const LOCK_WAIT_MS = 4000;

export const roomKey = (code: string) => `room:${code}`;
export const lockKey = (code: string) => `room:${code}:lock`;
export const strokesKey = (code: string, turnId: string) => `room:${code}:strokes:${turnId}`;
export const channel = (code: string) => `room:${code}`;

export async function loadRoom(code: string): Promise<RoomState | null> {
  const raw = await getStore().get(roomKey(code));
  return raw ? (JSON.parse(raw) as RoomState) : null;
}

export async function saveRoom(state: RoomState): Promise<void> {
  await getStore().set(roomKey(state.code), JSON.stringify(state), ROOM_TTL_SEC);
}

export async function roomExists(code: string): Promise<boolean> {
  return (await getStore().get(roomKey(code))) !== null;
}

export async function publish(code: string, msg: BusMessage): Promise<void> {
  await getStore().publish(channel(code), JSON.stringify(msg));
}

export async function publishState(state: RoomState): Promise<void> {
  await publish(state.code, { type: "state", state });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `fn` with the room lock held. `fn` receives the current state (or null if the room
 * does not exist) and returns the new state to persist (or null to leave it untouched).
 * If a new state is returned it is saved and broadcast.
 */
export async function withRoomLock<T>(
  code: string,
  fn: (state: RoomState | null) => Promise<{ state: RoomState | null; result: T }> | { state: RoomState | null; result: T },
): Promise<T> {
  const store = getStore();
  const key = lockKey(code);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let token: string | null = null;
  let delay = 15;
  while (!token) {
    token = await store.acquireLock(key, LOCK_TTL_MS);
    if (token) break;
    if (Date.now() > deadline) throw new GameError("Room is busy, try again", 503);
    await sleep(delay + Math.random() * 20);
    delay = Math.min(delay * 2, 150);
  }
  try {
    const current = await loadRoom(code);
    const { state, result } = await fn(current);
    if (state) {
      await saveRoom(state);
      await publishState(state);
    }
    return result;
  } finally {
    await store.releaseLock(key, token);
  }
}

/** Apply a game action under the room lock, persist and broadcast if it changed anything. */
export async function applyAction(code: string, playerId: string, action: Action, now = Date.now()): Promise<RoomState> {
  return withRoomLock(code, (current) => {
    if (!current) throw new GameError("Room not found", 404);
    const { state, changed } = reduce(current, playerId, action, now);
    return { state: changed ? state : null, result: state };
  });
}

export async function appendStrokes(code: string, batch: DrawBatch): Promise<void> {
  const store = getStore();
  const hasClear = batch.ops.some((op) => op.t === "clear");
  if (hasClear) {
    // A clear wipes history; keep only ops after the last clear.
    const lastClear = batch.ops.map((o) => o.t).lastIndexOf("clear");
    await store.del(strokesKey(code, batch.turnId));
    batch = { ...batch, ops: batch.ops.slice(lastClear + 1) };
    if (batch.ops.length) await store.rpush(strokesKey(code, batch.turnId), batch.ops.map((o) => JSON.stringify(o)), STROKES_TTL_SEC);
    await publish(code, { type: "stroke", batch: { ...batch, ops: [{ t: "clear" }, ...batch.ops] } });
    return;
  }
  await store.rpush(strokesKey(code, batch.turnId), batch.ops.map((o) => JSON.stringify(o)), STROKES_TTL_SEC);
  await publish(code, { type: "stroke", batch });
}

export async function loadStrokes(code: string, turnId: string): Promise<StrokeOp[]> {
  const raw = await getStore().lrange(strokesKey(code, turnId));
  const ops: StrokeOp[] = raw.map((r) => JSON.parse(r) as StrokeOp);
  return compactOps(ops);
}

/** Apply undo ops so a fresh client doesn't need to process them. */
export function compactOps(ops: StrokeOp[]): StrokeOp[] {
  let out: StrokeOp[] = [];
  for (const op of ops) {
    if (op.t === "clear") out = [];
    else if (op.t === "undo") out = out.filter((o) => o.t !== "seg" || o.id !== op.id);
    else out.push(op);
  }
  return out;
}

// ---- auth helpers ----

export interface Identity {
  playerId: string;
  token: string;
}

export function identityFromRequest(req: Request): Identity | null {
  const url = new URL(req.url);
  const playerId = req.headers.get("x-player-id") ?? url.searchParams.get("playerId");
  const token = req.headers.get("x-player-token") ?? url.searchParams.get("token");
  if (!playerId || !token) return null;
  return { playerId, token };
}

export function assertIdentity(state: RoomState, id: Identity | null): string {
  if (!id) throw new GameError("Missing credentials", 401);
  const expected = state.secrets[id.playerId];
  if (!expected || expected !== id.token) throw new GameError("Invalid credentials", 401);
  return id.playerId;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof GameError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new GameError("Invalid JSON body");
  }
}
