"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Action, RoomView, ServerEvent, StrokeOp } from "@/lib/game/types";
import { StrokeStore } from "@/lib/client/strokes";
import type { RoomIdentity } from "@/lib/client/identity";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "kicked" | "gone";

export interface RoomConnection {
  room: RoomView | null;
  status: ConnectionStatus;
  error: string | null;
  strokes: StrokeStore;
  /** server time offset in ms: serverNow ≈ Date.now() + offset */
  offset: number;
  send: (action: Action) => Promise<void>;
  sendDraw: (ops: StrokeOp[]) => void;
}

const TICK_SLACK_MS = 350;

export function useRoom(code: string, identity: RoomIdentity | null): RoomConnection {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const strokes = useMemo(() => new StrokeStore(), []);
  const roomRef = useRef<RoomView | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pendingStrokes = useRef<StrokeOp[][]>([]);
  const hasSnapshot = useRef(false);

  const applyRoom = useCallback(
    (next: RoomView) => {
      const cur = roomRef.current;
      if (cur && next.version < cur.version) return;
      roomRef.current = next;
      setRoom(next);
      setOffset(next.serverNow - Date.now());
      // New turn drawing phase → fresh canvas.
      const turnId = next.turn && next.phase !== "choosing" ? next.turn.id : next.turn?.id ?? null;
      if (turnId !== strokes.turnId && (next.phase === "drawing" || next.phase === "choosing")) {
        strokes.reset(turnId, []);
      }
    },
    [strokes],
  );

  // ---- SSE connection ----
  useEffect(() => {
    if (!identity) return;
    let disposed = false;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 800;
    hasSnapshot.current = false;

    const checkRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${code}/join`, {
          headers: { "x-player-id": identity.playerId, "x-player-token": identity.token },
          cache: "no-store",
        });
        if (res.status === 404) return "gone" as const;
        if (res.ok) {
          const data = (await res.json()) as { valid?: boolean };
          if (data.valid === false) return "invalid" as const;
        }
      } catch {
        /* network blip */
      }
      return "ok" as const;
    };

    const connect = () => {
      if (disposed) return;
      const url = `/api/rooms/${code}/events?playerId=${encodeURIComponent(identity.playerId)}&token=${encodeURIComponent(identity.token)}`;
      es = new EventSource(url);
      esRef.current = es;
      es.onopen = () => {
        backoff = 800;
        setStatus("open");
      };
      es.onmessage = (ev) => {
        let msg: ServerEvent;
        try {
          msg = JSON.parse(ev.data) as ServerEvent;
        } catch {
          return;
        }
        switch (msg.type) {
          case "snapshot": {
            applyRoom(msg.room);
            strokes.reset(msg.turnId, msg.strokes);
            // Re-apply any stroke batches that raced ahead of the snapshot (duplicates are harmless).
            for (const ops of pendingStrokes.current) strokes.apply(ops);
            pendingStrokes.current = [];
            hasSnapshot.current = true;
            setError(null);
            break;
          }
          case "state":
            applyRoom(msg.room);
            break;
          case "stroke": {
            if (msg.batch.turnId !== strokes.turnId) {
              if (!hasSnapshot.current) pendingStrokes.current.push(msg.batch.ops);
              break;
            }
            if (!hasSnapshot.current) pendingStrokes.current.push(msg.batch.ops);
            else strokes.apply(msg.batch.ops);
            break;
          }
          case "kicked":
            disposed = true;
            es?.close();
            setStatus("kicked");
            break;
          case "error":
            setError(msg.message);
            break;
        }
      };
      es.onerror = () => {
        es?.close();
        esRef.current = null;
        if (disposed) return;
        setStatus("reconnecting");
        hasSnapshot.current = false;
        retryTimer = setTimeout(async () => {
          const verdict = await checkRoom();
          if (disposed) return;
          if (verdict === "gone") {
            setStatus("gone");
            setError("This room no longer exists.");
            return;
          }
          if (verdict === "invalid") {
            setStatus("kicked");
            return;
          }
          connect();
        }, backoff);
        backoff = Math.min(backoff * 1.7, 8000);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      esRef.current = null;
    };
  }, [code, identity, applyRoom, strokes]);

  // ---- actions ----
  const send = useCallback(
    async (action: Action) => {
      if (!identity) throw new Error("Not connected");
      const res = await fetch(`/api/rooms/${code}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-player-id": identity.playerId,
          "x-player-token": identity.token,
        },
        body: JSON.stringify(action),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; room?: RoomView };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.room) applyRoom(data.room);
    },
    [code, identity, applyRoom],
  );

  // ---- drawing (batched, ordered) ----
  const drawQueue = useRef<StrokeOp[]>([]);
  const drawInFlight = useRef(false);
  const flushDraw = useCallback(async () => {
    if (drawInFlight.current || !identity) return;
    drawInFlight.current = true;
    try {
      while (drawQueue.current.length) {
        const ops = drawQueue.current;
        drawQueue.current = [];
        const turnId = strokes.turnId;
        if (!turnId) continue;
        try {
          await fetch(`/api/rooms/${code}/draw`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-player-id": identity.playerId,
              "x-player-token": identity.token,
            },
            body: JSON.stringify({ turnId, ops }),
            keepalive: true,
          });
        } catch {
          /* drop the batch; the next one continues the stroke */
        }
      }
    } finally {
      drawInFlight.current = false;
    }
  }, [code, identity, strokes]);

  const sendDraw = useCallback(
    (ops: StrokeOp[]) => {
      drawQueue.current.push(...ops);
      void flushDraw();
    },
    [flushDraw],
  );

  // ---- timers: ask the server to advance when a phase or hint is due ----
  useEffect(() => {
    if (!room) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const due: number[] = [];
    if (room.phaseEndsAt) due.push(room.phaseEndsAt);
    if (room.turn?.hintTimes) due.push(...room.turn.hintTimes);
    const phaseId = room.phaseId;
    for (const at of due) {
      const delay = Math.max(0, at - (Date.now() + offset) + TICK_SLACK_MS);
      timers.push(
        setTimeout(() => {
          if (roomRef.current?.phaseId !== phaseId && at === room.phaseEndsAt) return;
          send({ type: "tick" }).catch(() => {});
        }, delay),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [room, offset, send]);

  return { room, status, error, strokes, offset, send, sendDraw };
}
