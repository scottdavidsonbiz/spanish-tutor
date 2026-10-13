"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface TurnView {
  id: number;
  speaker: "tutor" | "learner";
  text: string;
}

type Status = "idle" | "recording" | "thinking" | "speaking" | "ending";

const MIN_RECORDING_MS = 400;

export default function Conversation({
  sessionId,
  initialTurns,
}: {
  sessionId: number;
  initialTurns: TurnView[];
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<TurnView[]>(initialTurns);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const lastTutorTurn = [...turns].reverse().find((t) => t.speaker === "tutor");

  const play = useCallback((turnId: number) => {
    audioRef.current?.pause();
    const audio = new Audio(`/api/tts/${turnId}`);
    audioRef.current = audio;
    setStatus("speaking");
    audio.onended = () => setStatus("idle");
    audio.onerror = () => {
      setStatus("idle");
      setError("Couldn't play Sofía's voice. Check ELEVENLABS_VOICE_ID and your ElevenLabs key.");
    };
    audio.play().catch(() => setStatus("idle")); // Autoplay can be blocked until the first click.
  }, []);

  // Play the greeting when the page opens on a fresh session.
  useEffect(() => {
    if (initialTurns.length === 1 && initialTurns[0].speaker === "tutor") play(initialTurns[0].id);
    return () => audioRef.current?.pause();
  }, [initialTurns, play]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, status]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current || status === "thinking" || status === "ending") return;
    setError(null);
    audioRef.current?.pause(); // Talking over Sofía stops her.
    try {
      streamRef.current ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    const recorder = new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorder.start();
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setStatus("recording");
  }, [status]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    const tooShort = Date.now() - startedAtRef.current < MIN_RECORDING_MS;

    recorder.onstop = async () => {
      if (tooShort) {
        setStatus("idle");
        return;
      }
      const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setStatus("thinking");
      try {
        const form = new FormData();
        form.append("sessionId", String(sessionId));
        form.append("audio", audio, "turn.webm");
        const res = await fetch("/api/turn", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (data.empty) {
          setError("I didn't catch that. Hold the button while you talk.");
          setStatus("idle");
          return;
        }
        setTurns((prev) => [
          ...prev,
          { id: data.learner.id, speaker: "learner", text: data.learner.text },
          { id: data.tutor.id, speaker: "tutor", text: data.tutor.text },
        ]);
        play(data.tutor.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("idle");
      }
    };
    recorder.stop();
  }, [play, sessionId]);

  // Spacebar push-to-talk.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        startRecording();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startRecording, stopRecording]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function endSession() {
    audioRef.current?.pause();
    setStatus("ending");
    setError(null);
    try {
      const res = await fetch(`/api/session/${sessionId}/end`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Report failed");
      router.push(`/report/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  const hint: Record<Status, string> = {
    idle: "Hold to talk (or hold the spacebar)",
    recording: "Listening… let go when you're done",
    thinking: "Sofía is thinking…",
    speaking: "Sofía is talking. Hold to interrupt.",
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
          <button onClick={endSession} disabled={status === "ending" || status === "recording"}>
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
          <button
            className={`talk ${status === "recording" ? "recording" : ""}`}
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            disabled={status === "thinking" || status === "ending"}
            aria-label="Hold to talk"
          >
            {status === "recording" ? "●" : "Talk"}
          </button>
          <div className="row">
            <span className="muted">{hint[status]}</span>
            {lastTutorTurn && status === "idle" && (
              <button onClick={() => play(lastTutorTurn.id)}>Repeat</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
