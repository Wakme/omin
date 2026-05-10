import type { Conversation, ExecutionState } from "./conversation.js";

/**
 * Core 暴露给 Plugin 的接口。
 * Plugin 只依赖这个接口，不依赖 OmniCore 实现。
 */
export interface CoreApi {
  getConversation(id: string): Conversation | undefined;
  listConversations(): Conversation[];
  createConversation(
    name: string,
    pluginNames: string[],
    options?: { context?: Record<string, unknown>; bindings?: Record<string, string> }
  ): Conversation;
  send(conversationId: string, message: import("./conversation.js").Message): void;
  updateConversation(id: string, update: Partial<Pick<Conversation, "execution" | "context" | "bindings">>): void;
  markDone(conversationId: string): void;
  markError(conversationId: string): void;
}
