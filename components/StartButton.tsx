"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { sessionId } = await res.json();
      router.push(`/session/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  }

  return (
    <div className="row" style={{ marginTop: 16 }}>
      <button className="primary" onClick={start} disabled={starting}>
        {starting ? "Calling Sofía…" : "Start a conversation"}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
