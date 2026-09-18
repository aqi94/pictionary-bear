"use client";

import { AVATAR_COLORS, BearFace } from "./Bear";

export function AvatarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="Pick your bear">
      {AVATAR_COLORS.map((c, i) => (
        <button
          key={c.name}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(i)}
          className={`rounded-full p-0.5 border-3 transition ${
            value === i ? "border-bark bg-honey scale-110" : "border-transparent hover:bg-cream-2"
          }`}
        >
          <BearFace avatar={i} size={34} />
        </button>
      ))}
    </div>
  );
}
