"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRoom } from "@/hooks/useRoom";
import { clearIdentity, saveIdentity, saveProfile, useIdentity, useProfile, type RoomIdentity } from "@/lib/client/identity";
import { BearFace, BearMascot } from "./Bear";
import { AvatarPicker } from "./AvatarPicker";
import { Lobby } from "./Lobby";
import { Game } from "./Game";

export function RoomClient({ code }: { code: string }) {
  const identity = useIdentity(code);

  if (identity === undefined) return <Centered>Loading…</Centered>;
  if (identity === null) return <JoinGate code={code} />;
  return <Connected code={code} identity={identity} onReset={() => clearIdentity(code)} />;
}

function Connected({ code, identity, onReset }: { code: string; identity: RoomIdentity; onReset: () => void }) {
  const conn = useRoom(code, identity);
  const { room, status, error } = conn;

  useEffect(() => {
    if (status === "kicked") clearIdentity(code);
  }, [status, code]);

  if (status === "kicked") {
    return (
      <Centered>
        <BearMascot size={120} />
        <h2 className="font-display text-2xl font-bold mt-2">You left the den</h2>
        <p className="text-brown mt-1">You were removed from room {code}, or your session expired.</p>
        <button className="btn mt-4" onClick={onReset}>
          Join again
        </button>
      </Centered>
    );
  }
  if (status === "gone") {
    return (
      <Centered>
        <BearMascot size={120} />
        <h2 className="font-display text-2xl font-bold mt-2">Room not found</h2>
        <p className="text-brown mt-1">{error ?? "This room has closed."}</p>
        <Link className="btn mt-4" href="/">
          Back home
        </Link>
      </Centered>
    );
  }
  if (!room) {
    return (
      <Centered>
        <BearMascot size={120} className="animate-wiggle" />
        <p className="font-display text-xl font-semibold mt-2">{error ? error : "Sniffing out the room…"}</p>
        {error && (
          <button className="btn mt-4" onClick={onReset}>
            Try joining again
          </button>
        )}
      </Centered>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {status === "reconnecting" && (
        <div role="status" className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] chip bg-honey shadow-[3px_3px_0_var(--bark)]">
          Reconnecting…
        </div>
      )}
      {room.phase === "lobby" ? <Lobby conn={conn} /> : <Game conn={conn} />}
    </div>
  );
}

function JoinGate({ code }: { code: string }) {
  const stored = useProfile();
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [avatarEdit, setAvatarEdit] = useState<number | null>(null);
  const name = nameEdit ?? stored?.name ?? "";
  const avatar = avatarEdit ?? stored?.avatar ?? 0;
  const [info, setInfo] = useState<{ players: number; maxPlayers: number; phase: string } | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${code}/join`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        setInfo(r.ok ? await r.json() : "missing");
      })
      .catch(() => !cancelled && setInfo("missing"));
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const profile = { name: name.trim() || "Bear", avatar };
    saveProfile(profile);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join");
      saveIdentity(code, { playerId: data.playerId, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (info === "missing") {
    return (
      <Centered>
        <BearMascot size={120} />
        <h2 className="font-display text-2xl font-bold mt-2">Room {code} not found</h2>
        <p className="text-brown mt-1">Double-check the code, or start a new room.</p>
        <Link className="btn mt-4" href="/">
          Back home
        </Link>
      </Centered>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-md p-6 space-y-5 animate-pop">
        <div className="flex items-center gap-3">
          <BearFace avatar={avatar} size={52} />
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight">Join room {code}</h1>
            {info && (
              <p className="text-sm text-brown font-semibold">
                {info.players}/{info.maxPlayers} bears inside{info.phase !== "lobby" ? " · game in progress" : ""}
              </p>
            )}
          </div>
        </div>
        <div>
          <label className="block font-display font-semibold mb-1" htmlFor="join-name">
            Your name
          </label>
          <input id="join-name" className="input" maxLength={16} value={name} onChange={(e) => setNameEdit(e.target.value)} placeholder="e.g. Honey" />
        </div>
        <div>
          <span className="block font-display font-semibold mb-2">Pick your bear</span>
          <AvatarPicker value={avatar} onChange={setAvatarEdit} />
        </div>
        <button className="btn w-full text-lg" type="submit" disabled={busy}>
          {busy ? "Joining…" : "Join the den"}
        </button>
        {error && (
          <p role="alert" className="text-berry font-bold text-sm text-center">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-10">{children}</main>;
}
