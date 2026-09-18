import { notFound } from "next/navigation";
import { normalizeCode } from "@/lib/codes";
import { RoomClient } from "@/components/RoomClient";

export default async function RoomPage({ params }: PageProps<"/room/[code]">) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);
  if (!code) notFound();
  return <RoomClient code={code} />;
}
