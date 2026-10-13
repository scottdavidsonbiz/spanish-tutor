import { getTurn } from "@/lib/db";
import { speak } from "@/lib/elevenlabs";

export const runtime = "nodejs";

/** Stream a tutor line as MP3 so the browser can start playing before it finishes. */
export async function GET(_req: Request, ctx: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await ctx.params;
  const turn = getTurn(Number(turnId));
  if (!turn || turn.speaker !== "tutor") return new Response("Not found", { status: 404 });

  const audio = await speak(turn.text);
  return new Response(audio.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" },
  });
}
