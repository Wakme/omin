export type ExecutionState = "idle" | "executing" | "error";

export interface Message {
  conversationId: string;
  fromPlugin: string;
  content: string;
  timestamp: number;
  type: "text" | "system";
}

export interface Conversation {
  id: string;
  name: string;
  execution: ExecutionState;
  context: Record<string, unknown>;
  bindings: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
