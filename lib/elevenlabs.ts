const API = "https://api.elevenlabs.io/v1";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set in .env.local");
  return key;
}

/** Transcribe one push-to-talk recording with ElevenLabs Scribe. */
export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("language_code", "es");
  form.append("tag_audio_events", "false");
  form.append("file", audio, "turn.webm");

  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs speech-to-text failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Start streaming the tutor's line as MP3. The caller pipes the body to the browser. */
export async function speak(text: string): Promise<Response> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set in .env.local");

  const res = await fetch(
    `${API}/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        language_code: "es",
      }),
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`ElevenLabs text-to-speech failed (${res.status}): ${await res.text()}`);
  }
  return res;
}
