"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface TurnView {
  id: number;
  speaker: "tutor" | "learner";
  text: string;
}

type Mode = "off" | "listening" | "thinking" | "speaking" | "paused" | "ending";

// Voice detection tuning. RMS is measured on the raw microphone signal (0 to 1).
const MIN_VOICE_RMS = 0.015; // Quietest level counted as speech.
const VOICE_OVER_AMBIENT = 2.5; // Speech must be this many times louder than background noise.
const MIN_SPEECH_MS = 250; // Ignore coughs and clicks shorter than this.
const END_OF_TURN_SILENCE_MS = 1400; // You're done when you've been quiet this long.
const MAX_TURN_MS = 60_000;
const NO_ANSWER_MS = 15_000; // Sofía re-prompts if you say nothing for this long.
const MAX_REPROMPTS = 2; // Then she pauses until you come back.

export default function Conversation({
  sessionId,
  initialTurns,
}: {
  sessionId: number;
  initialTurns: TurnView[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<TurnView[]>(initialTurns);
  const [mode, setModeState] = useState<Mode>("off");
  const [error, setError] = useState<string | null>(null);

  const modeRef = useRef<Mode>("off");
  const turnsRef = useRef<TurnView[]>(initialTurns);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const finishRef = useRef<((kind: "send" | "silent" | "discard") => void) | null>(null);
  const repromptsRef = useRef(0);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  function setMode(next: Mode) {
    modeRef.current = next;
    setModeState(next);
  }

  function addTurns(...added: TurnView[]) {
    turnsRef.current = [...turnsRef.current, ...added];
    setTurns(turnsRef.current);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, mode]);

  // Release the microphone and audio when leaving the page.
  useEffect(
    () => () => {
      modeRef.current = "off";
      audioRef.current?.pause();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    },
    [],
  );

  async function start() {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(streamRef.current).connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    const last = turnsRef.current[turnsRef.current.length - 1];
    if (last?.speaker === "tutor") speak(last.id);
    else listen();
  }

  function speak(turnId: number) {
    setMode("speaking");
    audioRef.current?.pause();
    const audio = new Audio(`/api/tts/${turnId}`);
    audioRef.current = audio;
    audio.onended = () => modeRef.current === "speaking" && listen();
    audio.onerror = () => {
      setError("Couldn't play Sofía's voice. Check ELEVENLABS_VOICE_ID and your ElevenLabs key.");
      if (modeRef.current === "speaking") listen();
    };
    audio.play().catch(() => modeRef.current === "speaking" && listen());
  }

  /** Record until you stop talking, then send. Listening is off while Sofía speaks so she doesn't hear herself. */
  function listen() {
    const stream = streamRef.current;
    const analyser = analyserRef.current;
    if (!stream || !analyser) return;
    setMode("listening");

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.start(250);
    recorderRef.current = recorder;

    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let lastFrame = startedAt;
    let ambient = MIN_VOICE_RMS / VOICE_OVER_AMBIENT;
    let voicedMs = 0;
    let heard = false;
    let lastVoiceAt = startedAt;
    let finished = false;

    const finish = (kind: "send" | "silent" | "discard") => {
      if (finished) return;
      finished = true;
      finishRef.current = null;
      recorderRef.current = null;
      if (meterRef.current) meterRef.current.style.transform = "scaleX(0)";
      recorder.onstop = () => {
        if (kind === "send") sendRecording(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        else if (kind === "silent") sendSilence();
      };
      recorder.stop();
    };
    finishRef.current = finish;

    const tick = () => {
      if (finished) return;
      if (modeRef.current !== "listening") return finish("discard");

      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;

      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);

      const voice = rms > Math.max(MIN_VOICE_RMS, ambient * VOICE_OVER_AMBIENT);
      if (voice) {
        voicedMs += dt;
        lastVoiceAt = now;
        if (voicedMs >= MIN_SPEECH_MS) heard = true;
      } else {
        ambient = ambient * 0.95 + rms * 0.05;
        if (!heard) voicedMs = Math.max(0, voicedMs - dt); // Decay brief blips before real speech.
      }

      if (meterRef.current) {
        meterRef.current.style.transform = `scaleX(${Math.min(1, rms * 12)})`;
      }

      if (heard && now - lastVoiceAt > END_OF_TURN_SILENCE_MS) return finish("send");
      if (heard && now - startedAt > MAX_TURN_MS) return finish("send");
      if (!heard && now - startedAt > NO_ANSWER_MS) return finish("silent");
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function postTurn(form: FormData) {
    form.append("sessionId", String(sessionId));
    const res = await fetch("/api/turn", { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
    return res.json();
  }

  async function sendRecording(audio: Blob) {
    setMode("thinking");
    try {
      const form = new FormData();
      form.append("audio", audio, "turn.webm");
      const data = await postTurn(form);
      if (data.empty) {
        if (modeRef.current === "thinking") listen(); // Noise, not words: keep listening.
        return;
      }
      repromptsRef.current = 0;
      addTurns(
        { id: data.learner.id, speaker: "learner", text: data.learner.text },
        { id: data.tutor.id, speaker: "tutor", text: data.tutor.text },
      );
      if (modeRef.current === "thinking") speak(data.tutor.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("paused");
    }
  }

  async function sendSilence() {
    if (repromptsRef.current >= MAX_REPROMPTS) {
      repromptsRef.current = 0;
      setMode("paused");
      return;
    }
    repromptsRef.current += 1;
    setMode("thinking");
    try {
      const form = new FormData();
      form.append("silent", "1");
      const data = await postTurn(form);
      addTurns({ id: data.tutor.id, speaker: "tutor", text: data.tutor.text });
      if (modeRef.current === "thinking") speak(data.tutor.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("paused");
    }
  }

  function pause() {
    audioRef.current?.pause();
    setMode("paused"); // The listening loop sees this and discards the recording.
  }

  function resume() {
    setError(null);
    repromptsRef.current = 0;
    listen();
  }

  function repeat() {
    const last = [...turnsRef.current].reverse().find((t) => t.speaker === "tutor");
    if (last) speak(last.id);
  }

  async function endSession() {
    audioRef.current?.pause();
    setMode("ending");
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Report failed");
      router.push(`/report/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMode("paused");
    }
  }

  const hint: Record<Mode, string> = {
    off: "Sofía leads the conversation. Just talk when she asks you something.",
    listening: "Listening… just talk. Sofía answers when you pause.",
    thinking: "Sofía is thinking…",
    speaking: "Sofía is talking…",
    paused: "Paused. Resume when you're ready.",
    ending: "Writing your report…",
  };

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Sofía</h1>
          <span className="muted">Ciudad de México</span>
        </div>
        <div className="row">
          <Link href="/">Home</Link>
          <button onClick={endSession} disabled={mode === "ending"}>
            End and get feedback
          </button>
        </div>
      </div>

      <div className="transcript">
        {turns.map((t) => (
          <div key={t.id} className={`bubble ${t.speaker}`}>
            <span className="who">{t.speaker === "tutor" ? "Sofía" : "You"}</span>
            {t.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="dock">
        <div className="dock-inner">
          {error && <span className="error">{error}</span>}
          {mode === "off" ? (
            <button className="primary big" onClick={start}>
              Start talking
            </button>
          ) : (
            <>
              <div className={`status-dot ${mode}`} aria-hidden />
              <div className="meter">
                <div ref={meterRef} className="meter-fill" />
              </div>
            </>
          )}
          <span className="muted">{hint[mode]}</span>
          {mode !== "off" && mode !== "ending" && (
            <div className="row">
              {mode === "listening" && (
                <button onClick={() => finishRef.current?.("send")}>I&apos;m done talking</button>
              )}
              {mode === "paused" ? (
                <button className="primary" onClick={resume}>
                  Resume
                </button>
              ) : (
                <button onClick={pause}>Pause</button>
              )}
              {(mode === "paused" || mode === "listening") && <button onClick={repeat}>Repeat</button>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
