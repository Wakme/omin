import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { CodexSession, DailyDigest, DailyEvolution, SkillCandidate } from "./types.js";

export function buildDailyEvolution(date: string, sessions: CodexSession[]): DailyEvolution {
  const digest = buildDailyDigest(date, sessions);
  const candidates = buildSkillCandidates(date, sessions);
  digest.candidateCount = candidates.length;
  return { date, digest, candidates };
}

function buildDailyDigest(date: string, sessions: CodexSession[]): DailyDigest {
  const titles = sessions.map((session) => session.title).filter(Boolean);
  const workspaces = uniqueStrings(sessions.map((session) => session.cwd).filter(isString));
  const commandCount = sessions.reduce((sum, session) => sum + session.commands.length, 0);
  const summary = sessions.length === 0
    ? `No Codex sessions found for ${date}.`
    : [
      `${date} captured ${sessions.length} Codex session(s).`,
      workspaces.length ? `Workspaces: ${workspaces.map((item) => basename(item)).join(", ")}.` : "",
      commandCount ? `Observed ${commandCount} shell command(s).` : "",
    ].filter(Boolean).join(" ");

  return {
    date,
    summary,
    sourceSessionIds: sessions.map((session) => session.id),
    completedItems: titles.slice(0, 12),
    blockedItems: inferBlockedItems(sessions),
    repeatedPatterns: inferRepeatedPatterns(sessions),
    candidateCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function buildSkillCandidates(date: string, sessions: CodexSession[]): SkillCandidate[] {
  if (sessions.length === 0) return [];
  const candidates: SkillCandidate[] = [];
  candidates.push(...workspaceOperationCandidates(date, sessions));
  candidates.push(...researchPatternCandidates(date, sessions));
  candidates.push(...productFramingCandidates(date, sessions));
  candidates.push(...failureWarningCandidates(date, sessions));
  return dedupeCandidates(candidates);
}

function workspaceOperationCandidates(date: string, sessions: CodexSession[]): SkillCandidate[] {
  const byWorkspace = new Map<string, CodexSession[]>();
  for (const session of sessions) {
    if (!session.cwd || session.commands.length === 0) continue;
    const bucket = byWorkspace.get(session.cwd) ?? [];
    bucket.push(session);
    byWorkspace.set(session.cwd, bucket);
  }

  return [...byWorkspace.entries()].map(([cwd, workspaceSessions]) => {
    const commands = unique(workspaceSessions.flatMap((session) => session.commands.map((cmd) => cmd.cmd))).slice(0, 12);
    const workspace = basename(cwd);
    return candidate({
      date,
      title: `${workspace} workspace operations`,
      kind: "sop",
      targetSkillName: "repo-operations",
      sourceSessions: workspaceSessions,
      content: [
        `## ${workspace} workspace operations (date: ${date})`,
        `- Principle: Reuse the verified commands and paths observed while working in ${cwd}.`,
        "- When to Apply: Before asking Codex to continue work in this repository or diagnose local build/test behavior.",
        "- Steps:",
        ...commands.map((cmd, index) => `  ${index + 1}. \`${cmd}\``),
      ].join("\n"),
      evidence: commands.map((cmd) => `Observed command: ${cmd}`),
    });
  });
}

function researchPatternCandidates(date: string, sessions: CodexSession[]): SkillCandidate[] {
  const matched = sessions.filter((session) => textOf(session).match(/research|调研|github|项目|资料|搜/i));
  if (matched.length === 0) return [];
  return [candidate({
    date,
    title: "Research concrete mechanisms instead of labels",
    kind: "research_pattern",
    targetSkillName: "product-research",
    sourceSessions: matched,
    content: [
      `## Research concrete mechanisms instead of labels (date: ${date})`,
      "- Principle: When investigating an abstract AI/product concept, compare projects by their actual mechanism rather than README wording.",
      "- When to Apply: The user asks whether a concept such as memory, self-evolution, skill learning, or agent improvement is real.",
      "- Steps:",
      "  1. Identify representative projects and primary docs.",
      "  2. For each project, record knowledge source, distillation method, recall path, and closed-loop action.",
      "  3. Separate memory, skill, evaluation, workflow, and training mechanisms.",
      "  4. Translate the findings into product constraints for Omni.",
    ].join("\n"),
    evidence: matched.map((session) => `Session: ${session.title}`),
  })];
}

function productFramingCandidates(date: string, sessions: CodexSession[]): SkillCandidate[] {
  const matched = sessions.filter((session) => textOf(session).match(/Omni|产品|MVP|IM|session|skill|记忆|自进化/i));
  if (matched.length === 0) return [];
  return [candidate({
    date,
    title: "Frame Omni as daily Codex skill evolution",
    kind: "project_fact",
    targetSkillName: "omni-product",
    sourceSessions: matched,
    content: [
      `## Frame Omni as daily Codex skill evolution (date: ${date})`,
      "- Principle: Omni should not present itself as a generic IM bot or vague self-evolving AI.",
      "- When to Apply: Writing Omni product docs, roadmap, or implementation plans.",
      "- Steps:",
      "  1. Keep Codex sessions as the captured source of work.",
      "  2. Run asynchronous daily evolution instead of learning inside the main work path.",
      "  3. Generate skill candidates first.",
      "  4. Require user review before writing long-term Markdown skills.",
    ].join("\n"),
    evidence: matched.map((session) => `Session: ${session.title}`),
  })];
}

function failureWarningCandidates(date: string, sessions: CodexSession[]): SkillCandidate[] {
  const matched = sessions.filter((session) => textOf(session).match(/failed|error|失败|报错|blocked|中断|interrupt/i));
  if (matched.length === 0) return [];
  return [candidate({
    date,
    title: "Capture failures as warnings, not just summaries",
    kind: "warning",
    targetSkillName: "codex-failure-patterns",
    sourceSessions: matched,
    content: [
      `## Capture failures as warnings (date: ${date})`,
      "- Symptom: A session contains errors, interrupted commands, failed builds, or explicit user corrections.",
      "- Root Cause: Treating failed sessions as useless loses the most transferable learning.",
      "- Correct Approach: Convert failures into warnings with symptom, root cause, correct approach, and prevention rule.",
      "- Prevention: During daily evolution, always scan for failed commands and user corrections before generating skill candidates.",
    ].join("\n"),
    evidence: matched.map((session) => `Session: ${session.title}`),
  })];
}

function candidate(input: {
  date: string;
  title: string;
  kind: SkillCandidate["kind"];
  targetSkillName: string;
  sourceSessions: CodexSession[];
  content: string;
  evidence: string[];
}): SkillCandidate {
  const sourceSessionIds = input.sourceSessions.map((session) => session.id);
  const hash = createHash("sha1")
    .update(`${input.date}:${input.title}:${sourceSessionIds.join(",")}`)
    .digest("hex")
    .slice(0, 12);
  const now = new Date().toISOString();
  return {
    id: `${input.date}-${hash}`,
    title: input.title,
    kind: input.kind,
    content: input.content,
    evidence: input.evidence,
    sourceSessionIds,
    sourceEventRefs: input.sourceSessions.map((session) => session.rolloutPath),
    status: "candidate",
    targetSkillName: input.targetSkillName,
    createdAt: now,
    updatedAt: now,
  };
}

function inferBlockedItems(sessions: CodexSession[]): string[] {
  return sessions
    .filter((session) => textOf(session).match(/failed|error|失败|报错|blocked|中断|interrupt/i))
    .map((session) => session.title)
    .slice(0, 8);
}

function inferRepeatedPatterns(sessions: CodexSession[]): string[] {
  const patterns: string[] = [];
  const commandNames = sessions.flatMap((session) => session.commands.map((cmd) => cmd.cmd.split(/\s+/)[0])).filter(Boolean);
  const repeatedCommands = unique(commandNames.filter((name) => commandNames.indexOf(name) !== commandNames.lastIndexOf(name)));
  if (repeatedCommands.length) patterns.push(`Repeated command families: ${repeatedCommands.join(", ")}`);
  const workspaces = sessions.map((session) => session.cwd).filter(isString);
  const repeatedWorkspaces = unique(workspaces.filter((cwd) => workspaces.indexOf(cwd) !== workspaces.lastIndexOf(cwd)));
  if (repeatedWorkspaces.length) patterns.push(`Repeated workspaces: ${repeatedWorkspaces.map((cwd) => basename(cwd)).join(", ")}`);
  return patterns;
}

function dedupeCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.targetSkillName}:${candidate.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textOf(session: CodexSession): string {
  return [
    session.title,
    ...session.userMessages,
    ...session.assistantMessages,
    ...session.commands.map((command) => command.cmd),
  ].join("\n");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
