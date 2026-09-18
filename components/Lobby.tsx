"use client";

import { useState } from "react";
import type { RoomConnection } from "@/hooks/useRoom";
import { LIMITS, type Difficulty } from "@/lib/game/types";
import { BearFace } from "./Bear";
import { Chat } from "./Chat";

export function Lobby({ conn }: { conn: RoomConnection }) {
  const room = conn.room!;
  const me = room.players.find((p) => p.id === room.me);
  const isHost = room.hostId === room.me;
  const connectedCount = room.players.filter((p) => p.connected).length;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${room.code}` : `/room/${room.code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const setSetting = (patch: Partial<typeof room.settings>) => act(() => conn.send({ type: "update_settings", settings: patch }));

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <p className="text-sm font-bold text-brown uppercase tracking-wider">Room code</p>
            <p className="font-display text-5xl font-bold tracking-[0.25em] text-bark">{room.code}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={copy}>
              {copied ? "Copied!" : "Copy invite link"}
            </button>
            <button className="btn btn-danger btn-sm self-center" onClick={() => act(() => conn.send({ type: "leave" }))} title="Leave room">
              Leave
            </button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-display text-xl font-bold mb-3">
            Bears in the den <span className="chip ml-1">{room.players.length}/{room.settings.maxPlayers}</span>
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {room.players.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl border-2 border-bark p-2 bg-cream-2 ${p.connected ? "" : "opacity-50"}`}>
                <BearFace avatar={p.avatar} size={36} />
                <div className="min-w-0">
                  <p className="font-bold truncate text-sm">
                    {p.name}
                    {p.id === room.me && <span className="text-brown font-semibold"> (you)</span>}
                  </p>
                  <p className="text-xs text-brown font-semibold">{p.id === room.hostId ? "👑 host" : p.connected ? "ready" : "away"}</p>
                </div>
                {isHost && p.id !== room.me && (
                  <button className="ml-auto text-berry font-bold px-1" title="Kick" aria-label={`Kick ${p.name}`} onClick={() => act(() => conn.send({ type: "kick", targetId: p.id }))}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-display text-xl font-bold mb-3">Game settings {!isHost && <span className="text-sm text-brown font-semibold">(only the host can change these)</span>}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Rounds">
              <select className="input" value={room.settings.rounds} disabled={!isHost} onChange={(e) => setSetting({ rounds: Number(e.target.value) })}>
                {range(LIMITS.rounds.min, LIMITS.rounds.max).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Draw time">
              <select className="input" value={room.settings.drawTime} disabled={!isHost} onChange={(e) => setSetting({ drawTime: Number(e.target.value) })}>
                {[30, 45, 60, 80, 100, 120, 150, 180].map((n) => (
                  <option key={n} value={n}>
                    {n} seconds
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Words">
              <select className="input" value={room.settings.difficulty} disabled={!isHost} onChange={(e) => setSetting({ difficulty: e.target.value as Difficulty })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
            {isHost ? (
              <button
                className="btn text-lg"
                disabled={connectedCount < 2 || starting}
                onClick={() =>
                  act(async () => {
                    setStarting(true);
                    try {
                      await conn.send({ type: "start" });
                    } finally {
                      setStarting(false);
                    }
                  })
                }
              >
                {connectedCount < 2 ? "Waiting for another bear…" : "Start game"}
              </button>
            ) : (
              <p className="font-semibold text-brown">Waiting for {room.players.find((p) => p.id === room.hostId)?.name ?? "the host"} to start the game…</p>
            )}
            {error && (
              <p role="alert" className="text-berry font-bold text-sm">
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="text-sm text-brown px-1">
          <p className="font-display font-semibold text-bark">How it works</p>
          <p>
            Each round every bear draws once. The artist picks one of three words and has {room.settings.drawTime} seconds to draw it. Guess in the chat: quick guesses earn more points, and the
            artist scores for every bear who gets it. Letters get revealed as time runs low.
          </p>
        </section>
      </div>

      <aside className="card p-0 overflow-hidden flex flex-col min-h-[320px] lg:min-h-0">
        <Chat conn={conn} me={me} />
      </aside>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold text-brown mb-1">{label}</span>
      {children}
    </label>
  );
}

function range(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
