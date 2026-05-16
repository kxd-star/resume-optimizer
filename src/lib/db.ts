import path from 'path';
import fs from 'fs';

// sql.js - pure JS SQLite
let SQL: any = null;
let db: any = null;
let initPromise: Promise<any> | null = null;

const DB_PATH = path.join(process.cwd(), 'data', 'resume-optimizer.db');
const WASM_PATH = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

async function initDb(): Promise<any> {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Dynamic import to avoid type issues
  const initSqlJs = await import('sql.js').then((m) => m.default || m);
  SQL = await initSqlJs({
    locateFile: (file: string) => WASM_PATH,
  });

  let database: any;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    database = new SQL.Database(buffer);
  } else {
    database = new SQL.Database();
  }

  database.run('PRAGMA foreign_keys = ON');
  initSchema(database);
  saveDb(database);
  return database;
}

function saveDb(database: any): void {
  const data = database.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema(database: any): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS analysis_tasks (
      id TEXT PRIMARY KEY,
      client_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      progress_step TEXT DEFAULT 'jd_parsing',
      jd_text TEXT NOT NULL,
      resume_text TEXT NOT NULL,
      rewrite_mode TEXT DEFAULT 'standard',
      question_count INTEGER DEFAULT 8,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS analysis_results (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      jd_profile TEXT,
      resume_profile TEXT,
      match_result TEXT,
      diagnosis TEXT,
      optimized_resume TEXT,
      interview_questions TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES analysis_tasks(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL,
      version_type TEXT NOT NULL,
      content TEXT NOT NULL,
      match_result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (result_id) REFERENCES analysis_results(id) ON DELETE CASCADE
    )
  `);
}

export async function getDb(): Promise<any> {
  if (db) return db;
  if (!initPromise) {
    initPromise = initDb();
  }
  db = await initPromise;
  return db;
}

// ============ Analysis Tasks ============
export async function insertTask(task: {
  id: string;
  client_session_id?: string;
  jd_text: string;
  resume_text: string;
  rewrite_mode: string;
  question_count: number;
}): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT INTO analysis_tasks (id, client_session_id, status, progress_step, jd_text, resume_text, rewrite_mode, question_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [task.id, task.client_session_id || null, 'pending', 'jd_parsing', task.jd_text, task.resume_text, task.rewrite_mode, task.question_count]
  );
  saveDb(database);
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
  progress_step?: string,
  error_message?: string
): Promise<void> {
  const database = await getDb();
  database.run(
    "UPDATE analysis_tasks SET status = ?, progress_step = ?, error_message = ?, updated_at = datetime('now') WHERE id = ?",
    [status, progress_step || null, error_message || null, taskId]
  );
  saveDb(database);
}

export async function getTask(taskId: string): Promise<any> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM analysis_tasks WHERE id = ?');
  stmt.bind([taskId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

// ============ Analysis Results ============
export async function insertResult(result: {
  id: string;
  task_id: string;
  jd_profile: string;
  resume_profile: string;
  match_result: string;
  diagnosis: string;
  optimized_resume: string;
  interview_questions: string;
}): Promise<void> {
  const database = await getDb();
  database.run(
    'INSERT INTO analysis_results (id, task_id, jd_profile, resume_profile, match_result, diagnosis, optimized_resume, interview_questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [result.id, result.task_id, result.jd_profile, result.resume_profile, result.match_result, result.diagnosis, result.optimized_resume, result.interview_questions]
  );
  saveDb(database);
}

export async function getResultByTaskId(taskId: string): Promise<any> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM analysis_results WHERE task_id = ?');
  stmt.bind([taskId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

export async function updateResultMatch(resultId: string, matchResult: string): Promise<void> {
  const database = await getDb();
  database.run('UPDATE analysis_results SET match_result = ? WHERE id = ?', [matchResult, resultId]);
  saveDb(database);
}
