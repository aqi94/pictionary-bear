"use client";

import { useState } from "react";
import type { RoomConnection } from "@/hooks/useRoom";
import { CHOOSE_TIME_MS, TURN_END_MS, type RoomView } from "@/lib/game/types";
import { BearFace } from "./Bear";
import { Canvas } from "./Canvas";
import { Chat } from "./Chat";
import { PlayerList } from "./PlayerList";
import { Timer, useCountdown } from "./Timer";
import { Toolbar, type ToolState } from "./Toolbar";

export function Game({ conn }: { conn: RoomConnection }) {
  const room = conn.room!;
  const me = room.players.find((p) => p.id === room.me);
  const isDrawer = room.turn?.drawerId === room.me;
  const canDraw = isDrawer && room.phase === "drawing";
  const [tool, setTool] = useState<ToolState>({ color: "#000000", size: 8, tool: "brush" });

  const undo = () => {
    const id = conn.strokes.lastStrokeId();
    if (!id) return;
    conn.strokes.apply([{ t: "undo", id }]);
    conn.sendDraw([{ t: "undo", id }]);
  };
  const clear = () => {
    if (!conn.strokes.ops.length) return;
    conn.strokes.apply([{ t: "clear" }]);
    conn.sendDraw([{ t: "clear" }]);
  };

  const totalMs =
    room.phase === "choosing" ? CHOOSE_TIME_MS : room.phase === "drawing" ? room.settings.drawTime * 1000 : room.phase === "turn_end" ? TURN_END_MS : 0;

  return (
    <main className="flex-1 w-full max-w-[1400px] mx-auto px-2 sm:px-4 py-2 sm:py-3 grid gap-2 sm:gap-3 grid-rows-[auto_minmax(0,1fr)_auto] h-[100dvh] lg:grid-rows-1 lg:grid-cols-[230px_minmax(0,1fr)_320px] lg:h-[calc(100dvh-1.5rem)] lg:max-h-[900px]">
      {/* Players (sidebar on desktop, strip on mobile) */}
      <aside className="card p-2 lg:overflow-y-auto scrollbar-thin order-3 lg:order-1">
        <div className="hidden lg:flex items-center justify-between px-1 pb-2">
          <span className="font-display font-bold">Bears</span>
          <span className="chip">
            Round {room.round}/{room.settings.rounds}
          </span>
        </div>
        <div className="lg:hidden">
          <PlayerList conn={conn} horizontal />
        </div>
        <div className="hidden lg:block">
          <PlayerList conn={conn} />
        </div>
        <button className="hidden lg:inline-flex btn btn-sm btn-secondary mt-3 w-full" onClick={() => conn.send({ type: "leave" }).catch(() => {})}>
          Leave room
        </button>
      </aside>

      {/* Canvas column */}
      <section className="order-1 lg:order-2 flex flex-col gap-2 min-w-0">
        <TopBar room={room} offset={conn.offset} totalMs={totalMs} isDrawer={isDrawer} />
        <div className="relative card p-1.5 overflow-hidden">
          <Canvas store={conn.strokes} canDraw={canDraw} tool={tool} onOps={conn.sendDraw} />
          <Overlay conn={conn} />
        </div>
        {canDraw && <Toolbar state={tool} onChange={setTool} onUndo={undo} onClear={clear} />}
      </section>

      {/* Chat */}
      <aside className="card p-0 overflow-hidden flex flex-col order-2 lg:order-3 min-h-[180px] lg:min-h-0">
        <Chat conn={conn} me={me} />
      </aside>
    </main>
  );
}

function TopBar({ room, offset, totalMs, isDrawer }: { room: RoomView; offset: number; totalMs: number; isDrawer: boolean }) {
  const t = room.turn;
  const drawer = t ? room.players.find((p) => p.id === t.drawerId) : undefined;
  return (
    <div className="card px-3 py-2 flex items-center gap-3 min-h-[68px]">
      {room.phase !== "game_over" && <Timer endsAt={room.phaseEndsAt} totalMs={totalMs} offset={offset} />}
      <div className="flex-1 min-w-0 text-center">
        {room.phase === "drawing" && t && (
          <>
            <p className="text-xs font-bold text-brown uppercase tracking-wider">{isDrawer ? "Draw this" : `${drawer?.name ?? "Someone"} is drawing`}</p>
            <WordMask mask={t.mask} big={!isDrawer} />
          </>
        )}
        {room.phase === "choosing" && (
          <p className="font-display font-bold text-lg truncate">{isDrawer ? "Pick a word!" : `${drawer?.name ?? "Someone"} is choosing a word…`}</p>
        )}
        {room.phase === "turn_end" && room.lastTurn && (
          <p className="font-display font-bold text-lg truncate">
            The word was <span className="text-honey-dark">{room.lastTurn.word}</span>
          </p>
        )}
        {room.phase === "game_over" && <p className="font-display font-bold text-lg">Game over!</p>}
      </div>
      <span className="chip lg:hidden">
        R{room.round}/{room.settings.rounds}
      </span>
      {drawer && (
        <div className="hidden sm:flex items-center gap-1 text-sm font-bold" title="Current artist">
          <BearFace avatar={drawer.avatar} size={28} />
          <span className="max-w-[90px] truncate">{drawer.name}</span>
        </div>
      )}
    </div>
  );
}

function WordMask({ mask, big }: { mask: (string | null)[]; big: boolean }) {
  const letters = mask.filter((c) => c !== " ").length;
  return (
    <p className={`font-display font-bold ${big ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"} tracking-wide leading-tight`}>
      {mask.map((c, i) => (c === " " ? <span key={i} className="mask-space" /> : <span key={i} className="mask-letter">{c ?? " "}</span>))}
      <span className="ml-2 text-xs align-middle text-brown font-bold">{letters}</span>
    </p>
  );
}

function Overlay({ conn }: { conn: RoomConnection }) {
  const room = conn.room!;
  const isDrawer = room.turn?.drawerId === room.me;
  const [choosing, setChoosing] = useState(false);

  if (room.phase === "choosing" && room.turn) {
    const drawer = room.players.find((p) => p.id === room.turn!.drawerId);
    return (
      <div className="absolute inset-0 bg-bark/60 backdrop-blur-[2px] flex items-center justify-center p-4 rounded-xl">
        <div className="card p-5 w-full max-w-md text-center animate-pop">
          {isDrawer && room.turn.choices ? (
            <>
              <p className="font-display font-bold text-xl mb-1">Choose your word</p>
              <ChoiceCountdown endsAt={room.phaseEndsAt} offset={conn.offset} />
              <div className="grid gap-2 mt-3">
                {room.turn.choices.map((w, i) => (
                  <button
                    key={w}
                    className="btn text-lg"
                    disabled={choosing}
                    onClick={async () => {
                      setChoosing(true);
                      try {
                        await conn.send({ type: "choose_word", index: i });
                      } catch {
                        setChoosing(false);
                      }
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <BearFace avatar={drawer?.avatar ?? 0} size={64} className="mx-auto animate-wiggle" />
              <p className="font-display font-bold text-xl mt-2">{drawer?.name ?? "The artist"} is choosing a word…</p>
              <p className="text-brown font-semibold text-sm mt-1">Get your guessing paws ready.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (room.phase === "turn_end" && room.lastTurn) {
    const lt = room.lastTurn;
    const drawer = room.players.find((p) => p.id === lt.drawerId);
    const rows = Object.entries(lt.guesserPoints)
      .map(([id, pts]) => ({ p: room.players.find((x) => x.id === id), pts }))
      .sort((a, b) => b.pts - a.pts);
    return (
      <div className="absolute inset-0 bg-bark/60 backdrop-blur-[2px] flex items-center justify-center p-4 rounded-xl">
        <div className="card p-5 w-full max-w-md text-center animate-pop">
          <p className="text-sm font-bold text-brown uppercase tracking-wider">{lt.reason === "all_guessed" ? "Everyone got it!" : lt.reason === "timeout" ? "Time's up!" : "The artist left"}</p>
          <p className="font-display font-bold text-3xl text-honey-dark mt-1">{lt.word}</p>
          <ul className="mt-3 text-left space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
            <li className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-2">
                <BearFace avatar={drawer?.avatar ?? 0} size={26} /> {drawer?.name ?? "Artist"} <span className="chip">artist</span>
              </span>
              <span className="text-leaf">+{lt.drawerPoints}</span>
            </li>
            {rows.map(({ p, pts }, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <BearFace avatar={p?.avatar ?? 0} size={26} /> {p?.name ?? "Bear"}
                </span>
                <span className="text-leaf font-bold">+{pts}</span>
              </li>
            ))}
            {rows.length === 0 && <li className="text-brown italic text-sm">Nobody guessed it this time 🐻</li>}
          </ul>
        </div>
      </div>
    );
  }

  if (room.phase === "game_over") {
    const ranked = [...room.players].sort((a, b) => b.score - a.score);
    const isHost = room.hostId === room.me;
    const medals = ["🥇", "🥈", "🥉"];
    return (
      <div className="absolute inset-0 bg-bark/60 backdrop-blur-[2px] flex items-center justify-center p-4 rounded-xl">
        <div className="card p-5 w-full max-w-md text-center animate-pop">
          <p className="font-display font-bold text-3xl">Game over!</p>
          {ranked[0] && (
            <p className="font-semibold text-brown mt-1">
              {ranked[0].name} wins with {ranked[0].score} points
            </p>
          )}
          <ol className="mt-3 text-left space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
            {ranked.map((p, i) => (
              <li key={p.id} className={`flex items-center justify-between rounded-lg px-2 py-1 ${i === 0 ? "bg-honey/40" : ""}`}>
                <span className="flex items-center gap-2 font-bold">
                  <span className="w-6 text-center">{medals[i] ?? `${i + 1}.`}</span>
                  <BearFace avatar={p.avatar} size={26} /> {p.name}
                </span>
                <span className="font-bold">{p.score}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            {isHost ? (
              <button className="btn" onClick={() => conn.send({ type: "play_again" }).catch(() => {})}>
                Play again
              </button>
            ) : (
              <p className="text-sm text-brown font-semibold self-center">Waiting for the host to start another game…</p>
            )}
            <button className="btn btn-secondary" onClick={() => conn.send({ type: "leave" }).catch(() => {})}>
              Leave
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ChoiceCountdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const remaining = useCountdown(endsAt, offset);
  return <p className="text-sm text-brown font-semibold">{Math.ceil(remaining / 1000)}s — or the first one is picked for you</p>;
}
