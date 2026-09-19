"use client";

import { useState } from "react";
import type { RoomConnection } from "@/hooks/useRoom";
import { useAppViewport } from "@/hooks/useAppViewport";
import { CHOOSE_TIME_MS, TURN_END_MS, type RoomView } from "@/lib/game/types";
import { BearFace } from "./Bear";
import { Canvas } from "./Canvas";
import { Chat } from "./Chat";
import { PlayerList } from "./PlayerList";
import { Timer, useCountdown } from "./Timer";
import { Toolbar, type ToolState } from "./Toolbar";

export function Game({ conn }: { conn: RoomConnection }) {
  useAppViewport();
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

  // The shell has a DEFINITE height (the visible viewport) and never grows with its content:
  // phones get a flex column (canvas shrinks first, chat takes the rest), desktops a 3-column grid.
  return (
    <main className="game-shell w-full max-w-[1400px] mx-auto px-2 sm:px-4 py-2 sm:py-3 flex flex-col gap-2 sm:gap-3 lg:grid lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)_320px]">
      {/* Players (sidebar on desktop, strip on phones; hidden while the keyboard is up) */}
      <aside className="kb-hide card p-2 order-3 lg:order-1 shrink-0 min-w-0 min-h-0 lg:overflow-y-auto scrollbar-thin">
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
      <section className="order-1 lg:order-2 flex flex-col gap-2 min-w-0 min-h-0 shrink">
        <TopBar room={room} offset={conn.offset} totalMs={totalMs} isDrawer={isDrawer} />
        <div className="relative card overflow-hidden w-full aspect-[4/3] min-h-[130px] shrink">
          <Canvas store={conn.strokes} canDraw={canDraw} tool={tool} onOps={conn.sendDraw} />
          <Overlay conn={conn} />
        </div>
        {canDraw && <Toolbar state={tool} onChange={setTool} onUndo={undo} onClear={clear} />}
      </section>

      {/* Chat */}
      <aside className="card p-0 overflow-hidden flex flex-col order-2 lg:order-3 flex-1 basis-0 min-w-0 min-h-[140px] lg:min-h-0">
        <Chat conn={conn} me={me} />
      </aside>
    </main>
  );
}

function TopBar({ room, offset, totalMs, isDrawer }: { room: RoomView; offset: number; totalMs: number; isDrawer: boolean }) {
  const t = room.turn;
  const drawer = t ? room.players.find((p) => p.id === t.drawerId) : undefined;
  return (
    <div className="card px-3 py-2 flex items-center gap-3 min-h-[68px] shrink-0 min-w-0">
      {room.phase !== "game_over" && <Timer endsAt={room.phaseEndsAt} totalMs={totalMs} offset={offset} />}
      <div className="flex-1 min-w-0 text-center">
        {room.phase === "drawing" && t && (
          <>
            <p className="text-xs font-bold text-brown uppercase tracking-wider truncate">{isDrawer ? "Draw this" : `${drawer?.name ?? "Someone"} is drawing`}</p>
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
      <span className="chip lg:hidden shrink-0">
        R{room.round}/{room.settings.rounds}
      </span>
      {drawer && (
        <div className="hidden sm:flex items-center gap-1 text-sm font-bold shrink-0" title="Current artist">
          <BearFace avatar={drawer.avatar} size={28} />
          <span className="max-w-[90px] truncate">{drawer.name}</span>
        </div>
      )}
    </div>
  );
}

function WordMask({ mask, big }: { mask: (string | null)[]; big: boolean }) {
  const letters = mask.filter((c) => c !== " ").length;
  const long = mask.length > 12;
  const size = long ? "text-base sm:text-2xl" : big ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl";
  return (
    <p className={`font-display font-bold ${size} tracking-wide leading-tight`}>
      {mask.map((c, i) =>
        c === " " ? (
          <span key={i} className="mask-space" />
        ) : (
          <span key={i} className="mask-letter">
            {c ?? " "}
          </span>
        ),
      )}
      <span className="ml-2 text-xs align-middle text-brown font-bold">{letters}</span>
    </p>
  );
}

/** Backdrop inside the canvas card (desktop) — or a full-screen sheet on phones when `modal`. */
function Backdrop({ modal = false, children }: { modal?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`${modal ? "max-lg:fixed max-lg:inset-0 max-lg:z-50 lg:absolute lg:inset-0" : "absolute inset-0"} bg-bark/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4 lg:rounded-xl`}
    >
      {children}
    </div>
  );
}

const SHEET = "card w-full max-w-md max-h-full flex flex-col text-center animate-pop p-3 sm:p-5 min-h-0";

function Overlay({ conn }: { conn: RoomConnection }) {
  const room = conn.room!;
  const isDrawer = room.turn?.drawerId === room.me;

  if (room.phase === "choosing" && room.turn) {
    const drawer = room.players.find((p) => p.id === room.turn!.drawerId);
    if (isDrawer && room.turn.choices) {
      // Keyed by turn so the "already picked" state can never leak into this player's next turn.
      return (
        <Backdrop modal>
          <WordChoice key={room.turn.id} conn={conn} choices={room.turn.choices} />
        </Backdrop>
      );
    }
    return (
      <Backdrop>
        <div className={SHEET}>
          <BearFace avatar={drawer?.avatar ?? 0} size={56} className="mx-auto animate-wiggle shrink-0" />
          <p className="font-display font-bold text-lg sm:text-xl mt-2">{drawer?.name ?? "The artist"} is choosing a word…</p>
          <p className="text-brown font-semibold text-sm mt-1">Get your guessing paws ready.</p>
        </div>
      </Backdrop>
    );
  }

  if (room.phase === "turn_end" && room.lastTurn) {
    const lt = room.lastTurn;
    const drawer = room.players.find((p) => p.id === lt.drawerId);
    const rows = Object.entries(lt.guesserPoints)
      .map(([id, pts]) => ({ p: room.players.find((x) => x.id === id), pts }))
      .sort((a, b) => b.pts - a.pts);
    return (
      <Backdrop>
        <div className={SHEET}>
          <p className="text-xs sm:text-sm font-bold text-brown uppercase tracking-wider shrink-0">
            {lt.reason === "all_guessed" ? "Everyone got it!" : lt.reason === "timeout" ? "Time's up!" : "The artist left"}
          </p>
          <p className="font-display font-bold text-2xl sm:text-3xl text-honey-dark shrink-0">{lt.word}</p>
          <ul className="mt-2 text-left space-y-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <li className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-2 min-w-0">
                <BearFace avatar={drawer?.avatar ?? 0} size={26} /> <span className="truncate">{drawer?.name ?? "Artist"}</span> <span className="chip">artist</span>
              </span>
              <span className="text-leaf">+{lt.drawerPoints}</span>
            </li>
            {rows.map(({ p, pts }, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="flex items-center gap-2 min-w-0">
                  <BearFace avatar={p?.avatar ?? 0} size={26} /> <span className="truncate">{p?.name ?? "Bear"}</span>
                </span>
                <span className="text-leaf font-bold">+{pts}</span>
              </li>
            ))}
            {rows.length === 0 && <li className="text-brown italic text-sm">Nobody guessed it this time 🐻</li>}
          </ul>
        </div>
      </Backdrop>
    );
  }

  if (room.phase === "game_over") {
    const ranked = [...room.players].sort((a, b) => b.score - a.score);
    const isHost = room.hostId === room.me;
    const medals = ["🥇", "🥈", "🥉"];
    return (
      <Backdrop modal>
        <div className={SHEET}>
          <p className="font-display font-bold text-2xl sm:text-3xl shrink-0">Game over!</p>
          {ranked[0] && (
            <p className="font-semibold text-brown mt-1 shrink-0">
              {ranked[0].name} wins with {ranked[0].score} points
            </p>
          )}
          <ol className="mt-3 text-left space-y-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            {ranked.map((p, i) => (
              <li key={p.id} className={`flex items-center justify-between rounded-lg px-2 py-1 ${i === 0 ? "bg-honey/40" : ""}`}>
                <span className="flex items-center gap-2 font-bold min-w-0">
                  <span className="w-6 text-center shrink-0">{medals[i] ?? `${i + 1}.`}</span>
                  <BearFace avatar={p.avatar} size={26} /> <span className="truncate">{p.name}</span>
                </span>
                <span className="font-bold">{p.score}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center shrink-0 pb-1 pr-1">
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
      </Backdrop>
    );
  }

  return null;
}

function WordChoice({ conn, choices }: { conn: RoomConnection; choices: string[] }) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const room = conn.room!;

  async function pick(index: number) {
    setPending(index);
    setError(null);
    try {
      await conn.send({ type: "choose_word", index });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pick that word");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={SHEET}>
      <p className="font-display font-bold text-xl shrink-0">Choose your word</p>
      <ChoiceCountdown endsAt={room.phaseEndsAt} offset={conn.offset} />
      <div className="grid gap-2 mt-3 pr-1 pb-1">
        {choices.map((w, i) => (
          <button key={w} data-testid="word-choice" className="btn text-lg" disabled={pending !== null} onClick={() => pick(i)}>
            {pending === i ? "Picking…" : w}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-berry font-bold text-sm mt-2">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceCountdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const remaining = useCountdown(endsAt, offset);
  return <p className="text-sm text-brown font-semibold shrink-0">{Math.ceil(remaining / 1000)}s — or the first one is picked for you</p>;
}
