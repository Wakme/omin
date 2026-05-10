import { join } from "node:path";
import { buildDailyEvolution } from "./evolution.js";
import { filterSessionsByDate, listCodexSessions, toDateKey } from "./session-reader.js";
import { loadDailyEvolution, saveDailyEvolution, updateCandidateStatus, writeAcceptedSkills } from "./store.js";

interface CliOptions {
  date?: string;
  codexHome?: string;
  timezone: string;
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args, options } = parseArgs(argv);

  switch (command) {
    case "sessions":
      await sessionsCommand(options);
      break;
    case "evolve":
      await evolveCommand(options);
      break;
    case "candidates":
      await candidatesCommand(options);
      break;
    case "accept":
      await acceptCommand(args, options);
      break;
    case "write-skills":
      await writeSkillsCommand(options);
      break;
    case "help":
    default:
      printHelp();
      break;
  }
}

async function sessionsCommand(options: CliOptions): Promise<void> {
  const sessions = await listCodexSessions({ codexHome: options.codexHome, timezone: options.timezone });
  const filtered = options.date ? filterSessionsByDate(sessions, options.date, options.timezone) : sessions.slice(0, 20);
  if (filtered.length === 0) {
    console.log("No Codex sessions found.");
    return;
  }

  for (const session of filtered) {
    const date = toDateKey(session.updatedAt ?? session.createdAt, options.timezone);
    console.log(`${date}  ${session.id.slice(0, 8)}  ${session.title}`);
    if (session.cwd) console.log(`          cwd: ${session.cwd}`);
  }
}

async function evolveCommand(options: CliOptions): Promise<void> {
  const date = options.date ?? toDateKey(undefined, options.timezone);
  const sessions = filterSessionsByDate(
    await listCodexSessions({ codexHome: options.codexHome, timezone: options.timezone }),
    date,
    options.timezone,
  );
  const evolution = buildDailyEvolution(date, sessions);
  await saveDailyEvolution(evolution);
  console.log(`Daily evolution generated for ${date}`);
  console.log(`Sessions: ${sessions.length}`);
  console.log(`Candidates: ${evolution.candidates.length}`);
  console.log(`Review: ${join(".omni", "daily", `${date}.md`)}`);
}

async function candidatesCommand(options: CliOptions): Promise<void> {
  const date = options.date ?? toDateKey(undefined, options.timezone);
  const evolution = await loadDailyEvolution(date);
  if (evolution.candidates.length === 0) {
    console.log(`No skill candidates for ${date}.`);
    return;
  }
  for (const candidate of evolution.candidates) {
    console.log(`${candidate.id}  [${candidate.status}]  ${candidate.title} -> ${candidate.targetSkillName}`);
  }
}

async function acceptCommand(args: string[], options: CliOptions): Promise<void> {
  const date = options.date ?? toDateKey(undefined, options.timezone);
  const candidateId = args[0];
  if (!candidateId) throw new Error("Usage: npm run omni -- accept <candidate-id> -- --date YYYY-MM-DD");
  const candidate = await updateCandidateStatus(date, candidateId, "accepted");
  console.log(`Accepted ${candidate.id}: ${candidate.title}`);
}

async function writeSkillsCommand(options: CliOptions): Promise<void> {
  const date = options.date ?? toDateKey(undefined, options.timezone);
  const accepted = await writeAcceptedSkills(date);
  console.log(`Wrote ${accepted.length} accepted candidate(s) to ${join(".omni", "skills")}`);
}

function parseArgs(argv: string[]): { command: string; args: string[]; options: CliOptions } {
  const args: string[] = [];
  const options: CliOptions = { timezone: "Asia/Shanghai" };
  let command = "help";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (i === 0 && !arg.startsWith("--")) {
      command = arg;
      continue;
    }
    if (arg === "--date") {
      options.date = argv[++i];
      continue;
    }
    if (arg === "--codex-home") {
      options.codexHome = argv[++i];
      continue;
    }
    if (arg === "--timezone") {
      options.timezone = argv[++i];
      continue;
    }
    args.push(arg);
  }

  return { command, args, options };
}

function printHelp(): void {
  console.log(`Omni Next

Commands:
  sessions                  List recent Codex sessions
  sessions --date DATE      List sessions for a day
  evolve --date DATE        Generate daily digest and skill candidates
  candidates --date DATE    List generated skill candidates
  accept ID --date DATE     Mark a candidate accepted
  write-skills --date DATE  Write accepted candidates to Markdown skills

Options:
  --date YYYY-MM-DD
  --codex-home PATH         Defaults to ~/.codex
  --timezone TZ             Defaults to Asia/Shanghai
`);
}
