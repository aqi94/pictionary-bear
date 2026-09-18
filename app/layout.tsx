import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Pictionary Bear",
  description: "Draw, guess, and giggle. A cozy multiplayer Pictionary game — join with a 4-letter room code.",
  openGraph: {
    title: "Pictionary Bear",
    description: "Draw, guess, and giggle. A cozy multiplayer Pictionary game.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5b32b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
