import { notFound, redirect } from "next/navigation";
import { getSession, getTurns } from "@/lib/db";
import Conversation from "@/components/Conversation";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const session = getSession(id);
  if (!session) notFound();
  if (session.report_json) redirect(`/report/${id}`);

  const turns = getTurns(id).map((t) => ({ id: t.id, speaker: t.speaker, text: t.text }));
  return <Conversation sessionId={id} initialTurns={turns} />;
}
