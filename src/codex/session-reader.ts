import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import type { CodexCommand, CodexSession, CodexToolCall } from "./types.js";

interface SessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

export interface SessionReaderOptions {
  codexHome?: string;
  timezone?: string;
}

export async function listCodexSessions(options: SessionReaderOptions = {}): Promise<CodexSession[]> {
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const index = await readSessionIndex(join(codexHome, "session_index.jsonl"));
  const files = await findJsonlFiles(join(codexHome, "sessions"));
  const sessions = await Promise.all(files.map((file) => parseSessionFile(file, index)));

  return sessions
    .filter((session): session is CodexSession => session !== undefined)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export function filterSessionsByDate(
  sessions: CodexSession[],
  date: string,
  timezone = "Asia/Shanghai",
): CodexSession[] {
  return sessions.filter((session) => toDateKey(session.updatedAt ?? session.createdAt, timezone) === date);
}

export function toDateKey(value: string | undefined, timezone = "Asia/Shanghai"): string {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

async function readSessionIndex(path: string): Promise<Map<string, SessionIndexEntry>> {
  const map = new Map<string, SessionIndexEntry>();
  try {
    const raw = await readFile(path, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as SessionIndexEntry;
      map.set(entry.id, entry);
    }
  } catch {
    // A missing index is fine; rollout files still contain metadata.
  }
  return map;
}

async function findJsonlFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return findJsonlFiles(path);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) return [path];
      return [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

async function parseSessionFile(
  rolloutPath: string,
  index: Map<string, SessionIndexEntry>,
): Promise<CodexSession | undefined> {
  const raw = await readFile(rolloutPath, "utf-8");
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];
  const commands: CodexCommand[] = [];
  const toolCalls: CodexToolCall[] = [];
  const filePaths = new Set<string>();

  let id = idFromRolloutPath(rolloutPath);
  let cwd: string | undefined;
  let source: string | undefined;
  let model: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let item: any;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }

    if (typeof item.timestamp === "string") updatedAt = item.timestamp;

    if (item.type === "session_meta" && item.payload) {
      id = item.payload.id ?? id;
      cwd = item.payload.cwd ?? cwd;
      source = item.payload.source ?? source;
      model = item.payload.model ?? item.payload.model_provider ?? model;
      createdAt = item.payload.timestamp ?? createdAt;
      updatedAt = item.payload.timestamp ?? updatedAt;
      continue;
    }

    if (item.type === "event_msg" && item.payload) {
      if (item.payload.type === "user_message" && typeof item.payload.message === "string") {
        userMessages.push(cleanMessage(item.payload.message));
      }
      if (item.payload.type === "agent_message" && typeof item.payload.message === "string") {
        assistantMessages.push(cleanMessage(item.payload.message));
      }
      continue;
    }

    if (item.type === "response_item" && item.payload?.type === "function_call") {
      const toolCall = parseToolCall(item.payload);
      toolCalls.push(toolCall);
      if (toolCall.name === "exec_command") {
        const command = parseExecCommand(toolCall.arguments);
        if (command) {
          commands.push(command);
          extractFilePathHints(command.cmd).forEach((path) => filePaths.add(path));
        }
      }
    }
  }

  const indexEntry = index.get(id);
  const fileStat = await stat(rolloutPath);
  const firstUserMessage = userMessages.find(Boolean);
  const title = indexEntry?.thread_name ?? firstUserMessage?.slice(0, 80) ?? basename(rolloutPath, ".jsonl");

  return {
    id,
    title,
    rolloutPath,
    cwd,
    source,
    model,
    createdAt: createdAt ?? fileStat.birthtime.toISOString(),
    updatedAt: indexEntry?.updated_at ?? updatedAt ?? fileStat.mtime.toISOString(),
    userMessages,
    assistantMessages,
    commands,
    toolCalls,
    filePaths: [...filePaths],
  };
}

function parseToolCall(payload: any): CodexToolCall {
  let args: unknown = payload.arguments;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      // Keep the original string when it is not JSON.
    }
  }
  return { name: payload.name ?? "unknown", arguments: args };
}

function parseExecCommand(args: unknown): CodexCommand | undefined {
  if (!args || typeof args !== "object") return undefined;
  const maybe = args as { cmd?: unknown; workdir?: unknown };
  if (typeof maybe.cmd !== "string") return undefined;
  return {
    cmd: maybe.cmd,
    workdir: typeof maybe.workdir === "string" ? maybe.workdir : undefined,
  };
}

function idFromRolloutPath(path: string): string {
  const match = basename(path).match(/rollout-[^-]+-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/);
  return match?.[1] ?? basename(path, ".jsonl");
}

function cleanMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

function extractFilePathHints(command: string): string[] {
  const paths = new Set<string>();
  const matches = command.matchAll(/(?:^|\s)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|py|toml|yaml|yml|css|html|sql))(?:\s|$|:)/g);
  for (const match of matches) {
    paths.add(match[1]);
  }
  return [...paths];
}
