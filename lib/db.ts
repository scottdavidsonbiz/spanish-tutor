import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { tutorDb?: Database.Database };

export const db =
  globalForDb.tutorDb ?? new Database(path.join(DATA_DIR, "tutor.db"));
globalForDb.tutorDb = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  report_json TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  speaker TEXT NOT NULL CHECK (speaker IN ('tutor', 'learner')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER NOT NULL REFERENCES turns(id),
  category TEXT NOT NULL,
  original TEXT NOT NULL,
  correction TEXT NOT NULL,
  explanation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vocab_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turn_id INTEGER REFERENCES turns(id),
  spanish TEXT NOT NULL,
  english TEXT NOT NULL,
  example TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export type Speaker = "tutor" | "learner";

export interface Turn {
  id: number;
  session_id: number;
  speaker: Speaker;
  text: string;
  created_at: string;
}

export interface Mistake {
  id: number;
  turn_id: number;
  category: string;
  original: string;
  correction: string;
  explanation: string;
}

export interface SessionRow {
  id: number;
  started_at: string;
  ended_at: string | null;
  report_json: string | null;
}

export function createSession(): number {
  return Number(db.prepare("INSERT INTO sessions DEFAULT VALUES").run().lastInsertRowid);
}

export function getSession(id: number): SessionRow | undefined {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
}

export function listSessions(): (SessionRow & { turn_count: number })[] {
  return db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) AS turn_count
       FROM sessions s ORDER BY s.id DESC LIMIT 50`,
    )
    .all() as (SessionRow & { turn_count: number })[];
}

export function addTurn(sessionId: number, speaker: Speaker, text: string): number {
  return Number(
    db
      .prepare("INSERT INTO turns (session_id, speaker, text) VALUES (?, ?, ?)")
      .run(sessionId, speaker, text).lastInsertRowid,
  );
}

export function getTurn(id: number): Turn | undefined {
  return db.prepare("SELECT * FROM turns WHERE id = ?").get(id) as Turn | undefined;
}

export function getTurns(sessionId: number): Turn[] {
  return db
    .prepare("SELECT * FROM turns WHERE session_id = ? ORDER BY id")
    .all(sessionId) as Turn[];
}

export function addMistakes(
  turnId: number,
  mistakes: Omit<Mistake, "id" | "turn_id">[],
): void {
  const insert = db.prepare(
    "INSERT INTO mistakes (turn_id, category, original, correction, explanation) VALUES (?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const m of mistakes) {
      insert.run(turnId, m.category, m.original, m.correction, m.explanation);
    }
  })();
}

export function getSessionMistakes(sessionId: number): Mistake[] {
  return db
    .prepare(
      `SELECT m.* FROM mistakes m JOIN turns t ON t.id = m.turn_id
       WHERE t.session_id = ? ORDER BY m.id`,
    )
    .all(sessionId) as Mistake[];
}

export function addVocab(
  items: { turnId: number | null; spanish: string; english: string; example?: string }[],
): void {
  const insert = db.prepare(
    "INSERT INTO vocab_items (turn_id, spanish, english, example) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const v of items) insert.run(v.turnId, v.spanish, v.english, v.example ?? null);
  })();
}

export function saveReport(sessionId: number, report: unknown): void {
  db.prepare(
    "UPDATE sessions SET ended_at = datetime('now'), report_json = ? WHERE id = ?",
  ).run(JSON.stringify(report), sessionId);
}
