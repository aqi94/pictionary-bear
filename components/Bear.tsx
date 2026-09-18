export const AVATAR_COLORS = [
  { fur: "#b5733a", inner: "#e2b48a", name: "Brown" },
  { fur: "#e9a93a", inner: "#f7d792", name: "Honey" },
  { fur: "#6f6f6f", inner: "#b9b9b9", name: "Grizzle" },
  { fur: "#e8d9c0", inner: "#f7efe1", name: "Polar" },
  { fur: "#d96f5c", inner: "#f2b8ad", name: "Cinnamon" },
  { fur: "#e58cb0", inner: "#f6c7da", name: "Berry" },
  { fur: "#6ea8d9", inner: "#b7d6ee", name: "Blueberry" },
  { fur: "#79b56a", inner: "#bcdcb3", name: "Moss" },
];

export function BearFace({ avatar = 0, size = 40, className = "" }: { avatar?: number; size?: number; className?: string }) {
  const c = AVATAR_COLORS[avatar % AVATAR_COLORS.length];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="22" cy="24" r="16" fill={c.fur} stroke="#3d2914" strokeWidth="4" />
      <circle cx="78" cy="24" r="16" fill={c.fur} stroke="#3d2914" strokeWidth="4" />
      <circle cx="22" cy="24" r="7" fill={c.inner} />
      <circle cx="78" cy="24" r="7" fill={c.inner} />
      <circle cx="50" cy="55" r="38" fill={c.fur} stroke="#3d2914" strokeWidth="4" />
      <ellipse cx="50" cy="66" rx="18" ry="13" fill={c.inner} />
      <ellipse cx="50" cy="61" rx="7" ry="5" fill="#3d2914" />
      <path d="M50 66 v6 M44 75 q6 5 12 0" stroke="#3d2914" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="37" cy="48" r="4" fill="#3d2914" />
      <circle cx="63" cy="48" r="4" fill="#3d2914" />
      <circle cx="38.5" cy="46.5" r="1.3" fill="white" />
      <circle cx="64.5" cy="46.5" r="1.3" fill="white" />
    </svg>
  );
}

/** The mascot: a bear holding a pencil. */
export function BearMascot({ size = 160, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      {/* pencil */}
      <g transform="rotate(-35 150 130)">
        <rect x="140" y="60" width="20" height="110" rx="3" fill="#f5b32b" stroke="#3d2914" strokeWidth="4" />
        <rect x="140" y="60" width="20" height="16" fill="#e58cb0" stroke="#3d2914" strokeWidth="4" />
        <path d="M140 170 L150 192 L160 170 Z" fill="#f2d9b0" stroke="#3d2914" strokeWidth="4" strokeLinejoin="round" />
        <path d="M146 183 L150 192 L154 183 Z" fill="#3d2914" />
      </g>
      {/* ears */}
      <circle cx="52" cy="58" r="24" fill="#b5733a" stroke="#3d2914" strokeWidth="5" />
      <circle cx="132" cy="58" r="24" fill="#b5733a" stroke="#3d2914" strokeWidth="5" />
      <circle cx="52" cy="58" r="11" fill="#e2b48a" />
      <circle cx="132" cy="58" r="11" fill="#e2b48a" />
      {/* head */}
      <circle cx="92" cy="105" r="62" fill="#b5733a" stroke="#3d2914" strokeWidth="5" />
      <ellipse cx="92" cy="125" rx="30" ry="22" fill="#e2b48a" />
      <ellipse cx="92" cy="116" rx="11" ry="8" fill="#3d2914" />
      <path d="M92 124 v9 M82 138 q10 8 20 0" stroke="#3d2914" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="70" cy="95" r="6" fill="#3d2914" />
      <circle cx="114" cy="95" r="6" fill="#3d2914" />
      <circle cx="72" cy="93" r="2" fill="white" />
      <circle cx="116" cy="93" r="2" fill="white" />
      {/* blush */}
      <ellipse cx="56" cy="118" rx="9" ry="5" fill="#e58cb0" opacity="0.6" />
      <ellipse cx="128" cy="118" rx="9" ry="5" fill="#e58cb0" opacity="0.6" />
      {/* paw holding pencil */}
      <circle cx="150" cy="148" r="16" fill="#b5733a" stroke="#3d2914" strokeWidth="5" />
    </svg>
  );
}
