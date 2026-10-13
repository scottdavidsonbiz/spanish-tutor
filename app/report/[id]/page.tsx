import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, getTurns } from "@/lib/db";
import type { SessionReport } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const session = getSession(id);
  if (!session) notFound();
  if (!session.report_json) redirect(`/session/${id}`);

  const report = JSON.parse(session.report_json) as SessionReport;
  const turns = getTurns(id);

  return (
    <>
      <div className="row spread">
        <h1>Session report</h1>
        <Link href="/">Home</Link>
      </div>
      <p className="muted">{new Date(session.started_at + "Z").toLocaleString()}</p>
      <p>{report.summary}</p>

      <h2>What went well</h2>
      <ul>
        {report.went_well.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>

      <h2>Mistakes to fix</h2>
      <div className="card">
        {report.top_mistakes.map((m, i) => (
          <div key={i} className="mistake">
            <span className="strike">{m.original}</span>
            <strong>{m.correction}</strong>
            <span className="muted">{m.explanation}</span>
          </div>
        ))}
      </div>

      <h2>Grammar to study</h2>
      {report.grammar_focus.map((g, i) => (
        <div key={i} className="card" style={{ marginBottom: 12 }}>
          <strong>{g.topic}</strong>
          <p style={{ margin: "6px 0" }}>{g.explanation}</p>
          <ul style={{ margin: 0 }}>
            {g.examples.map((ex, j) => (
              <li key={j}>{ex}</li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Vocabulary</h2>
      <table>
        <thead>
          <tr>
            <th>Español</th>
            <th>English</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          {report.vocab.map((v, i) => (
            <tr key={i}>
              <td>
                <strong>{v.spanish}</strong>
              </td>
              <td>{v.english}</td>
              <td className="muted">{v.example}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Next time</h2>
      <p>{report.next_time}</p>

      <details style={{ marginTop: 32 }}>
        <summary>Full transcript</summary>
        <div className="transcript" style={{ marginBottom: 0 }}>
          {turns.map((t) => (
            <div key={t.id} className={`bubble ${t.speaker}`}>
              <span className="who">{t.speaker === "tutor" ? "Sofía" : "You"}</span>
              {t.text}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
