export interface CodexCommand {
  cmd: string;
  workdir?: string;
}

export interface CodexToolCall {
  name: string;
  arguments: unknown;
}

export interface CodexSession {
  id: string;
  title: string;
  rolloutPath: string;
  cwd?: string;
  source?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
  userMessages: string[];
  assistantMessages: string[];
  commands: CodexCommand[];
  toolCalls: CodexToolCall[];
  filePaths: string[];
}

export type SkillCandidateKind =
  | "sop"
  | "warning"
  | "preference"
  | "project_fact"
  | "research_pattern";

export type SkillCandidateStatus =
  | "candidate"
  | "accepted"
  | "edited"
  | "rejected"
  | "merged";

export interface SkillCandidate {
  id: string;
  title: string;
  kind: SkillCandidateKind;
  content: string;
  evidence: string[];
  sourceSessionIds: string[];
  sourceEventRefs: string[];
  status: SkillCandidateStatus;
  targetSkillName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyDigest {
  date: string;
  summary: string;
  sourceSessionIds: string[];
  completedItems: string[];
  blockedItems: string[];
  repeatedPatterns: string[];
  candidateCount: number;
  createdAt: string;
}

export interface DailyEvolution {
  date: string;
  digest: DailyDigest;
  candidates: SkillCandidate[];
}
