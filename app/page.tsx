import Link from "next/link";
import { listSessions } from "@/lib/db";
import StartButton from "@/components/StartButton";

export const dynamic = "force-dynamic";

export default function Home() {
  const sessions = listSessions();
  return (
    <>
      <h1>Práctica con Sofía</h1>
      <p className="muted">Hold the button (or the spacebar) and talk. Sofía answers out loud.</p>
      <StartButton />

      <h2>Past sessions</h2>
      {sessions.length === 0 ? (
        <p className="muted">No sessions yet.</p>
      ) : (
        <ul className="sessions">
          {sessions.map((s) => (
            <li key={s.id} className="card row spread">
              <span>
                {new Date(s.started_at + "Z").toLocaleString()} · {s.turn_count} turns
              </span>
              {s.report_json ? (
                <Link href={`/report/${s.id}`}>Report</Link>
              ) : (
                <Link href={`/session/${s.id}`}>Continue</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
