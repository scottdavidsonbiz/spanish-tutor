import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Mistake, Turn } from "./db";

const client = new Anthropic();

const TUTOR_MODEL = "claude-opus-5-5";
const TAGGER_MODEL = "claude-haiku-5-5";
const REPORT_MODEL = "claude-opus-5-5";

// On a safety decline the API re-runs the request on Anthropic's recommended fallback model.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

// Kept byte-for-byte stable so prompt caching works across turns.
const TUTOR_SYSTEM = `Eres Sofía, una tutora de español de la Ciudad de México. Das clases de conversación por voz a Scott, un estudiante estadounidense.

Sobre Scott:
- Nivel conversacional (más o menos B1). Se comunica, pero comete errores de gramática y de pronunciación.
- Quiere practicar el español de México.

Tú guías la conversación:
- Tú decides de qué se habla: propones temas, haces preguntas abiertas y llevas el ritmo, como una buena maestra de iTalki.
- Si Scott responde muy poco, profundiza con una pregunta de seguimiento o propón un tema nuevo.
- Si recibes "[Scott se quedó callado]", es que no respondió: repite tu pregunta de forma más sencilla, ofrécele un par de opciones o cambia a un tema más fácil, con calidez.

Cómo hablas:
- Esto es una conversación hablada: todo lo que escribes se convierte en voz. Nada de listas, viñetas, emojis, asteriscos ni formato.
- Responde con 1 a 3 frases cortas y naturales, como en una videollamada con un amigo. Termina casi siempre con una pregunta para que Scott siga hablando. Él debe hablar mucho más que tú.
- Usa español mexicano natural (vocabulario y expresiones de México), a velocidad normal pero clara. Usa "tú".
- Muestra interés real, recuerda lo que te ha contado y haz preguntas de seguimiento.

Correcciones (suaves):
- No interrumpas la conversación para dar explicaciones de gramática.
- Cuando Scott cometa un error importante, repite su idea de forma correcta y natural dentro de tu respuesta (una "reformulación"), sin decir que se equivocó. Ejemplo: si dice "Yo fue al mercado ayer", tú dices "¡Ah, fuiste al mercado ayer! ¿Qué compraste?"
- Corrige como máximo un error por turno; ignora los errores pequeños.
- Si Scott usa una palabra en inglés, dale la palabra en español de forma natural y sigue.
- Si Scott te pide explícitamente una explicación o una traducción, dásela brevemente y vuelve a la conversación.

La transcripción de lo que dice Scott viene de reconocimiento de voz y puede tener errores de transcripción; no los trates como errores de Scott si parecen de la transcripción.

Al principio de la sesión, saluda a Scott con calidez y propón un tema ligero (su día, sus planes, algo de su vida).`;

const SESSION_START = "[Comienza la sesión de práctica. Saluda a Scott.]";
const LEARNER_SILENT = "[Scott se quedó callado]";

function toMessages(turns: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: SESSION_START },
  ];
  for (const t of turns) {
    const role = t.speaker === "tutor" ? "assistant" : "user";
    const last = messages[messages.length - 1];
    // Merge consecutive same-role turns (e.g. Scott spoke twice in a row) to keep roles alternating.
    if (last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${t.text}`;
    } else {
      messages.push({ role, content: t.text });
    }
  }
  return messages;
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * The tutor's next spoken line, given the conversation so far (ending with Scott, or empty to open).
 * With `learnerSilent`, Scott didn't answer her last line and she should re-prompt.
 */
export async function tutorReply(turns: Turn[], learnerSilent = false): Promise<string> {
  const messages = toMessages(turns);
  if (learnerSilent) messages.push({ role: "user", content: LEARNER_SILENT });
  const response = await client.beta.messages.create({
    model: TUTOR_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    system: TUTOR_SYSTEM,
    messages,
    ...FALLBACK,
  });
  if (response.stop_reason === "refusal") {
    return "Perdón, no puedo hablar de eso. ¿Hablamos de otra cosa?";
  }
  return textOf(response.content);
}

const TurnAnalysis = z.object({
  mistakes: z.array(
    z.object({
      category: z.enum([
        "verb tense",
        "conjugation",
        "gender/agreement",
        "ser/estar",
        "por/para",
        "subjunctive",
        "prepositions",
        "word order",
        "vocabulary/word choice",
        "pronouns",
        "other",
      ]),
      original: z.string().describe("The exact words Scott said that were wrong"),
      correction: z.string().describe("How a Mexican speaker would naturally say it"),
      explanation: z.string().describe("One short sentence in English explaining the rule"),
    }),
  ),
  vocab: z
    .array(
      z.object({
        spanish: z.string(),
        english: z.string(),
      }),
    )
    .describe(
      "Words or phrases worth adding to Scott's study list: words he said in English, words he misused, and useful new words the tutor introduced in her reply",
    ),
});

export type TurnAnalysis = z.infer<typeof TurnAnalysis>;

/** Tag one of Scott's turns for mistakes and vocab. Runs in the background after each reply. */
export async function analyzeTurn(
  previousTutorLine: string | null,
  learnerText: string,
  tutorReplyText: string,
): Promise<TurnAnalysis> {
  const response = await client.beta.messages.parse({
    model: TAGGER_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(TurnAnalysis) },
    system:
      "You review a Spanish learner's spoken turn (from speech recognition) in a conversation with a Mexican Spanish tutor. " +
      "List real grammar and vocabulary mistakes in Scott's turn only. Ignore punctuation, capitalization, accents in spelling, and likely transcription glitches. " +
      "Ignore choices that are acceptable in Mexican Spanish. If the turn has no mistakes, return an empty list. Keep explanations short and in English.",
    messages: [
      {
        role: "user",
        content:
          `Tutor said before: ${previousTutorLine ?? "(start of session)"}\n` +
          `Scott said: ${learnerText}\n` +
          `Tutor replied: ${tutorReplyText}`,
      },
    ],
  });
  return response.parsed_output ?? { mistakes: [], vocab: [] };
}

const SessionReport = z.object({
  summary: z.string().describe("2-3 sentences in English on what Scott talked about and how it went"),
  went_well: z.array(z.string()).describe("2-4 specific things Scott did well, in English"),
  top_mistakes: z
    .array(
      z.object({
        original: z.string(),
        correction: z.string(),
        explanation: z.string(),
      }),
    )
    .describe("The 3-6 most important mistakes, most important first, merged when repeated"),
  grammar_focus: z
    .array(
      z.object({
        topic: z.string().describe('e.g. "Preterite vs imperfect"'),
        explanation: z.string().describe("A short, plain-English explanation of the rule"),
        examples: z.array(z.string()).describe("2-3 correct example sentences in Mexican Spanish"),
      }),
    )
    .describe("1-3 grammar points to study next, based on patterns in the mistakes"),
  vocab: z
    .array(
      z.object({
        spanish: z.string(),
        english: z.string(),
        example: z.string().describe("A short example sentence in Spanish"),
      }),
    )
    .describe("8-15 words and phrases from this session worth reviewing"),
  next_time: z.string().describe("One sentence suggesting what to practice next session"),
});

export type SessionReport = z.infer<typeof SessionReport>;

/** Write the end-of-session report from the transcript and the tagged mistakes. */
export async function sessionReport(turns: Turn[], mistakes: Mistake[]): Promise<SessionReport> {
  const transcript = turns
    .map((t) => `${t.speaker === "tutor" ? "Sofía" : "Scott"}: ${t.text}`)
    .join("\n");
  const tagged = mistakes
    .map((m) => `- [${m.category}] "${m.original}" -> "${m.correction}" (${m.explanation})`)
    .join("\n");

  const response = await client.beta.messages.parse({
    model: REPORT_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(SessionReport) },
    system:
      "You are an experienced Spanish teacher writing a post-lesson report for Scott, a conversational (about B1) learner practicing Mexican Spanish. " +
      "Be encouraging but specific. Base everything on the transcript; the transcript comes from speech recognition, so ignore obvious transcription glitches.",
    messages: [
      {
        role: "user",
        content: `Transcript:\n${transcript}\n\nMistakes tagged during the session:\n${tagged || "(none)"}`,
      },
    ],
    ...FALLBACK,
  });
  if (!response.parsed_output) {
    throw new Error(`Report generation failed (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
