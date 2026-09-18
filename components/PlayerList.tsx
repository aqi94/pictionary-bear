"use client";

import type { RoomConnection } from "@/hooks/useRoom";
import { BearFace } from "./Bear";

export function PlayerList({ conn, horizontal = false }: { conn: RoomConnection; horizontal?: boolean }) {
  const room = conn.room!;
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const drawerId = room.turn?.drawerId;
  const guessed = new Set(room.turn?.guessed ?? []);
  const isHost = room.hostId === room.me;

  return (
    <ul className={horizontal ? "flex gap-2 overflow-x-auto scrollbar-thin px-1 py-1" : "flex flex-col gap-2"}>
      {ranked.map((p, i) => {
        const isDrawer = p.id === drawerId;
        const got = guessed.has(p.id);
        return (
          <li
            key={p.id}
            className={`relative flex items-center gap-2 rounded-xl border-2 border-bark px-2 py-1.5 ${horizontal ? "shrink-0 min-w-[140px]" : ""} ${
              got ? "bg-leaf/20" : isDrawer ? "bg-honey/40" : "bg-paper"
            } ${p.connected ? "" : "opacity-50"}`}
          >
            <span className="font-display font-bold text-brown text-xs w-4 text-center">#{i + 1}</span>
            <BearFace avatar={p.avatar} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate leading-tight">
                {p.id === room.hostId && <span title="Host">👑 </span>}
                {p.name}
                {p.id === room.me && <span className="text-brown font-semibold"> (you)</span>}
              </p>
              <p className="text-xs text-brown font-semibold leading-tight">{p.score} pts</p>
            </div>
            {isDrawer && (
              <span title="Drawing" aria-label="Drawing" className="text-base">
                ✏️
              </span>
            )}
            {got && (
              <span title="Guessed it" aria-label="Guessed it" className="text-leaf font-bold">
                ✓
              </span>
            )}
            {isHost && p.id !== room.me && (
              <button
                className="text-berry/70 hover:text-berry font-bold px-1 text-xs"
                title={`Kick ${p.name}`}
                aria-label={`Kick ${p.name}`}
                onClick={() => conn.send({ type: "kick", targetId: p.id }).catch(() => {})}
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
