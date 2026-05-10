import type { Conversation, ExecutionState } from "../types/index.js";

let db: any = null;

export async function initDb(path: string): Promise<void> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs();
  const buf = await readFileIfExists(path);
  db = new SQL.Database(buf);
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA foreign_keys=ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      execution  TEXT NOT NULL DEFAULT 'idle',
      context    TEXT NOT NULL DEFAULT '{}',
      bindings   TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      from_plugin     TEXT NOT NULL,
      content         TEXT NOT NULL DEFAULT '',
      timestamp       INTEGER NOT NULL,
      type            TEXT NOT NULL DEFAULT 'text'
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, timestamp)`);
}

export async function saveDb(path: string): Promise<void> {
  if (!db) return;
  const data = db.export();
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(path.substring(0, path.lastIndexOf("/")), { recursive: true });
  await writeFile(path, Buffer.from(data));
}

export async function closeDb(): Promise<void> {
  await saveDb("data/omni.db");
  db?.close();
  db = null;
}

// --- Conversation ---

export function insertConversation(conv: Conversation): void {
  db.run(
    `INSERT INTO conversations (id, name, execution, context, bindings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [conv.id, conv.name, conv.execution, JSON.stringify(conv.context), JSON.stringify(conv.bindings), conv.createdAt, conv.updatedAt]
  );
}

export function getConversation(id: string): Conversation | undefined {
  const row = db.exec("SELECT * FROM conversations WHERE id = ?", [id]);
  if (!row[0]?.length) return undefined;
  return rowToConversation(row[0]);
}

export function listConversations(): Conversation[] {
  const rows = db.exec("SELECT * FROM conversations ORDER BY updated_at DESC");
  if (!rows[0]?.length) return [];
  return rows[0].values.map((r: any[]) => rowToConversation({ columns: rows[0].columns, values: [r] }));
}

export function updateConversation(id: string, update: {
  execution?: ExecutionState;
  context?: Record<string, unknown>;
  bindings?: Record<string, string>;
}): void {
  const sets: string[] = [];
  const values: any[] = [];
  if (update.execution !== undefined) { sets.push("execution = ?"); values.push(update.execution); }
  if (update.context !== undefined) { sets.push("context = ?"); values.push(JSON.stringify(update.context)); }
  if (update.bindings !== undefined) { sets.push("bindings = ?"); values.push(JSON.stringify(update.bindings)); }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(Date.now(), id);
  db.run(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, values);
}

// --- Message ---

export function insertMessage(id: string, conversationId: string, fromPlugin: string, content: string, timestamp: number, type: string): void {
  db.run(
    `INSERT INTO messages (id, conversation_id, from_plugin, content, timestamp, type) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, conversationId, fromPlugin, content, timestamp, type]
  );
}

export function listMessages(conversationId: string, limit = 50): any[] {
  const rows = db.exec("SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?", [conversationId, limit]);
  if (!rows[0]?.length) return [];
  return rows[0].values.map((r: any[]) => {
    const obj: any = {};
    rows[0].columns.forEach((col: string, i: number) => obj[col] = r[i]);
    return obj;
  });
}

// --- Helpers ---

function rowToConversation(result: any): Conversation {
  const row = result.values[0];
  const obj: any = {};
  result.columns.forEach((col: string, i: number) => obj[col] = row[i]);
  return {
    id: obj.id,
    name: obj.name,
    execution: obj.execution,
    context: JSON.parse(obj.context),
    bindings: JSON.parse(obj.bindings),
    createdAt: obj.created_at,
    updatedAt: obj.updated_at,
  };
}

async function readFileIfExists(path: string): Promise<Uint8Array | undefined> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path);
  } catch {
    return undefined;
  }
}
