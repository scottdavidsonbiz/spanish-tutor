import { NextResponse } from "next/server";
import { getSession, getSessionMistakes, getTurns, saveReport } from "@/lib/db";
import { sessionReport } from "@/lib/claude";
import { settle } from "@/lib/pending";

export const runtime = "nodejs";

/** End the session and write the report. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessionId = Number((await ctx.params).id);
  if (!getSession(sessionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const turns = getTurns(sessionId);
  if (!turns.some((t) => t.speaker === "learner")) {
    return NextResponse.json({ error: "Say something first so there is something to review." }, { status: 400 });
  }

  await settle(sessionId);
  const report = await sessionReport(turns, getSessionMistakes(sessionId));
  saveReport(sessionId, report);
  return NextResponse.json({ ok: true });
}
