import { NextResponse } from "next/server";
import { addTurn, createSession } from "@/lib/db";
import { tutorReply } from "@/lib/claude";

export const runtime = "nodejs";

/** Start a session; the tutor speaks first. */
export async function POST() {
  const sessionId = createSession();
  const greeting = await tutorReply([]);
  addTurn(sessionId, "tutor", greeting);
  return NextResponse.json({ sessionId });
}
