import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DailyEvolution, SkillCandidate } from "./types.js";

export interface StoreOptions {
  root?: string;
}

export function storeRoot(options: StoreOptions = {}): string {
  return options.root ?? process.env.OMNI_HOME ?? ".omni";
}

export async function saveDailyEvolution(evolution: DailyEvolution, options: StoreOptions = {}): Promise<void> {
  const root = storeRoot(options);
  const jsonPath = join(root, "daily", `${evolution.date}.json`);
  const markdownPath = join(root, "daily", `${evolution.date}.md`);
  await writeJson(jsonPath, evolution);
  await writeText(markdownPath, renderDailyMarkdown(evolution));
}

export async function loadDailyEvolution(date: string, options: StoreOptions = {}): Promise<DailyEvolution> {
  const path = join(storeRoot(options), "daily", `${date}.json`);
  return JSON.parse(await readFile(path, "utf-8")) as DailyEvolution;
}

export async function updateCandidateStatus(
  date: string,
  candidateId: string,
  status: SkillCandidate["status"],
  options: StoreOptions = {},
): Promise<SkillCandidate> {
  const evolution = await loadDailyEvolution(date, options);
  const candidate = evolution.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
  candidate.status = status;
  candidate.updatedAt = new Date().toISOString();
  await saveDailyEvolution(evolution, options);
  return candidate;
}

export async function writeAcceptedSkills(date: string, options: StoreOptions = {}): Promise<SkillCandidate[]> {
  const evolution = await loadDailyEvolution(date, options);
  const accepted = evolution.candidates.filter((candidate) =>
    candidate.status === "accepted" || candidate.status === "edited" || candidate.status === "merged"
  );

  for (const candidate of accepted) {
    const skillDir = join(storeRoot(options), "skills", candidate.targetSkillName);
    await ensureSkillReadme(skillDir, candidate);
    const fileName = `${date}.md`;
    await appendFile(join(skillDir, fileName), `${candidate.content}\n\n`, "utf-8");
  }

  return accepted;
}

async function ensureSkillReadme(skillDir: string, candidate: SkillCandidate): Promise<void> {
  const path = join(skillDir, "SKILL.md");
  try {
    await readFile(path, "utf-8");
  } catch {
    const content = [
      "---",
      `name: "${candidate.targetSkillName}"`,
      `description: "Omni-generated skill space for ${candidate.targetSkillName}"`,
      "---",
      `# ${candidate.targetSkillName}`,
      "",
      "## Purpose",
      "Store reviewed Codex work patterns as reusable Markdown skills.",
      "",
      "## Guidelines",
      "- Keep entries concise and operational.",
      "- Include the date and source context.",
      "- Prefer updating broad skill spaces over creating narrow one-off skills.",
      "",
    ].join("\n");
    await writeText(path, content);
  }
}

function renderDailyMarkdown(evolution: DailyEvolution): string {
  const { digest, candidates } = evolution;
  return [
    `# Daily Evolution: ${evolution.date}`,
    "",
    "## Summary",
    digest.summary,
    "",
    "## Completed Items",
    ...listOrEmpty(digest.completedItems),
    "",
    "## Blocked Items",
    ...listOrEmpty(digest.blockedItems),
    "",
    "## Repeated Patterns",
    ...listOrEmpty(digest.repeatedPatterns),
    "",
    "## Skill Candidates",
    ...candidates.flatMap((candidate) => [
      `### ${candidate.title}`,
      "",
      `- id: \`${candidate.id}\``,
      `- kind: \`${candidate.kind}\``,
      `- status: \`${candidate.status}\``,
      `- target skill: \`${candidate.targetSkillName}\``,
      `- source sessions: ${candidate.sourceSessionIds.map((id) => `\`${id}\``).join(", ")}`,
      "",
      candidate.content,
      "",
      "Evidence:",
      ...candidate.evidence.map((item) => `- ${item}`),
      "",
    ]),
  ].join("\n");
}

function listOrEmpty(items: string[]): string[] {
  return items.length ? items.map((item) => `- ${item}`) : ["- None"];
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}
