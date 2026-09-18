"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BearMascot } from "@/components/Bear";
import { AvatarPicker } from "@/components/AvatarPicker";
import { saveIdentity, saveProfile, useProfile } from "@/lib/client/identity";
import { normalizeCode } from "@/lib/codes";

export default function Home() {
  return (
    <Suspense>
      <Landing />
    </Suspense>
  );
}

function Landing() {
  const router = useRouter();
  const params = useSearchParams();
  const stored = useProfile();
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [avatarEdit, setAvatarEdit] = useState<number | null>(null);
  const name = nameEdit ?? stored?.name ?? "";
  const avatar = avatarEdit ?? stored?.avatar ?? 0;
  const [code, setCode] = useState(params.get("join")?.toUpperCase() ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = () => {
    const p = { name: name.trim() || "Bear", avatar };
    saveProfile(p);
    return p;
  };

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile()) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create room");
      saveIdentity(data.code, { playerId: data.playerId, token: data.token });
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!c) {
      setError("Room codes are 4 letters/numbers, like BEAR");
      return;
    }
    setBusy("join");
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${c}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile()) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not join room");
      saveIdentity(c, { playerId: data.playerId, token: data.token });
      router.push(`/room/${c}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="flex flex-col items-center text-center mb-6">
        <BearMascot size={150} className="animate-wiggle drop-shadow-[4px_4px_0_rgba(61,41,20,0.25)]" />
        <h1 className="font-display text-5xl sm:text-6xl font-bold text-bark mt-2 tracking-tight">
          Pictionary <span className="text-honey-dark">Bear</span>
        </h1>
        <p className="text-brown font-semibold mt-2 max-w-sm">Draw, guess, and giggle with friends. Share a 4-letter code and start scribbling.</p>
      </div>

      <div className="card w-full max-w-md p-6 space-y-5">
        <div>
          <label className="block font-display font-semibold text-bark mb-1" htmlFor="name">
            Your name
          </label>
          <input id="name" className="input" placeholder="e.g. Honey" maxLength={16} value={name} onChange={(e) => setNameEdit(e.target.value)} autoComplete="nickname" />
        </div>
        <div>
          <span className="block font-display font-semibold text-bark mb-2">Pick your bear</span>
          <AvatarPicker value={avatar} onChange={setAvatarEdit} />
        </div>

        <button className="btn w-full text-lg" onClick={create} disabled={busy !== null}>
          {busy === "create" ? "Building the den…" : "Create a room"}
        </button>

        <div className="flex items-center gap-3 text-brown font-bold text-sm">
          <div className="h-0.5 flex-1 bg-brown/30" />
          or join a friend
          <div className="h-0.5 flex-1 bg-brown/30" />
        </div>

        <form onSubmit={join} className="flex gap-2">
          <input
            className="input font-display text-xl tracking-[0.3em] uppercase text-center"
            placeholder="CODE"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Room code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn btn-secondary whitespace-nowrap" type="submit" disabled={busy !== null}>
            {busy === "join" ? "Joining…" : "Join"}
          </button>
        </form>

        {error && (
          <p role="alert" className="text-berry font-bold text-sm text-center">
            {error}
          </p>
        )}
      </div>

      <section className="mt-8 max-w-md text-sm text-brown space-y-1 text-center">
        <p className="font-display font-semibold text-bark text-base">How to play</p>
        <p>One bear draws a secret word while everyone else types guesses in the chat. Faster guesses score more, and the artist earns points for every bear who gets it. Everyone takes a turn drawing each round.</p>
      </section>
    </main>
  );
}
