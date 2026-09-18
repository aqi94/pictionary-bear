"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomConnection } from "@/hooks/useRoom";
import type { ChatMessage, PlayerView } from "@/lib/game/types";

export function Chat({ conn, me, compact = false }: { conn: RoomConnection; me?: PlayerView; compact?: boolean }) {
  const room = conn.room!;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);

  const isDrawer = room.turn?.drawerId === room.me;
  const guessed = room.turn?.guessed.includes(room.me) ?? false;
  const canGuess = room.phase === "drawing" && !isDrawer && !guessed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    setError(null);
    try {
      await conn.send({ type: "guess", text: t });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {!compact && (
        <div className="px-3 py-2 border-b-3 border-bark bg-cream-2 font-display font-bold flex items-center justify-between">
          <span>Chat & guesses</span>
          {guessed && room.phase === "drawing" && <span className="chip bg-leaf text-white border-leaf">You got it!</span>}
        </div>
      )}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1 text-sm min-h-0"
        aria-live="polite"
      >
        {room.chat.map((m) => (
          <Line key={m.id} m={m} me={room.me} />
        ))}
      </div>
      <form onSubmit={submit} className="p-2 border-t-3 border-bark bg-cream-2 flex gap-2">
        <input
          className="input py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canGuess ? "Type your guess…" : isDrawer && room.phase === "drawing" ? "Chat with bears who guessed…" : "Say something…"}
          maxLength={60}
          autoComplete="off"
          aria-label="Chat message"
        />
        <button className="btn btn-sm" type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
      {error && <p className="text-xs text-berry font-bold px-3 pb-1">{error}</p>}
      {me && !me.connected && <p className="text-xs text-brown px-3 pb-1">Reconnecting…</p>}
    </div>
  );
}

function Line({ m, me }: { m: ChatMessage; me: string }) {
  switch (m.kind) {
    case "correct":
      return <p className="font-bold text-leaf animate-pop">🎉 {m.text}</p>;
    case "close":
      return <p className="font-bold text-honey-dark">🐝 {m.text}</p>;
    case "system":
      return <p className="italic text-brown">{m.text}</p>;
    case "join":
    case "leave":
      return <p className="text-brown/70 text-xs">{m.text}</p>;
    default:
      return (
        <p className="break-words">
          <span className={`font-bold ${m.playerId === me ? "text-sky" : "text-bark"}`}>{m.name}:</span>{" "}
          <span className={m.visibility === "guessed" ? "text-leaf" : ""}>{m.text}</span>
        </p>
      );
  }
}
