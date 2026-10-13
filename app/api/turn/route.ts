import { NextResponse } from "next/server";
import { addMistakes, addTurn, addVocab, getSession, getTurns } from "@/lib/db";
import { analyzeTurn, tutorReply } from "@/lib/claude";
import { transcribe } from "@/lib/elevenlabs";
import { track } from "@/lib/pending";

export const runtime = "nodejs";

/** One exchange: Scott's recording in, the tutor's reply out. */
export async function POST(req: Request) {
  const form = await req.formData();
  const sessionId = Number(form.get("sessionId"));
  const audio = form.get("audio");
  if (!getSession(sessionId) || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing session or audio" }, { status: 400 });
  }

  const learnerText = await transcribe(audio);
  if (!learnerText) return NextResponse.json({ empty: true });

  const before = getTurns(sessionId);
  const previousTutorLine = [...before].reverse().find((t) => t.speaker === "tutor")?.text ?? null;
  const learnerTurnId = addTurn(sessionId, "learner", learnerText);

  const replyText = await tutorReply(getTurns(sessionId));
  const tutorTurnId = addTurn(sessionId, "tutor", replyText);

  // Tag mistakes and vocab in the background so it never slows the reply.
  track(
    sessionId,
    analyzeTurn(previousTutorLine, learnerText, replyText)
      .then((analysis) => {
        addMistakes(learnerTurnId, analysis.mistakes);
        addVocab(analysis.vocab.map((v) => ({ turnId: learnerTurnId, ...v })));
      })
      .catch((err) => console.error("Turn analysis failed:", err)),
  );

  return NextResponse.json({
    learner: { id: learnerTurnId, text: learnerText },
    tutor: { id: tutorTurnId, text: replyText },
  });
}
