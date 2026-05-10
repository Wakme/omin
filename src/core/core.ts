import { randomUUID } from "node:crypto";
import { StateMachine } from "../state/machine.js";
import * as db from "../db/database.js";
import type { Plugin, CoreApi, Message, Conversation } from "../types/index.js";

export class OmniCore implements CoreApi {
  private plugins = new Map<string, Plugin>();
  private stateMachine = new StateMachine();

  async start(dbPath: string): Promise<void> {
    await db.initDb(dbPath);
    for (const conv of db.listConversations()) {
      this.stateMachine.init(conv.id, conv.execution);
    }
  }

  async stop(dbPath: string): Promise<void> {
    await db.saveDb(dbPath);
    await db.closeDb();
  }

  // --- Plugin management ---

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }

  // --- CoreApi implementation ---

  getConversation(id: string): Conversation | undefined {
    return db.getConversation(id);
  }

  listConversations(): Conversation[] {
    return db.listConversations();
  }

  createConversation(
    name: string,
    pluginNames: string[],
    options?: { context?: Record<string, unknown>; bindings?: Record<string, string> }
  ): Conversation {
    const now = Date.now();
    const conv: Conversation = {
      id: randomUUID(),
      name,
      execution: "idle",
      context: options?.context ?? {},
      bindings: options?.bindings ?? {},
      createdAt: now,
      updatedAt: now,
    };
    db.insertConversation(conv);
    this.stateMachine.init(conv.id, "idle");
    return conv;
  }

  updateConversation(id: string, update: Partial<Pick<Conversation, "execution" | "context" | "bindings">>): void {
    if (update.execution !== undefined) {
      this.stateMachine.transition(id, update.execution);
    }
    db.updateConversation(id, update);
  }

  send(conversationId: string, message: Message): void {
    const conv = db.getConversation(conversationId);
    if (!conv) return;

    db.insertMessage(randomUUID(), conversationId, message.fromPlugin, message.content, message.timestamp, message.type);

    if (message.fromPlugin !== "claude-code") {
      this.stateMachine.transition(conversationId, "executing");
      db.updateConversation(conversationId, { execution: "executing" });
    }

    for (const [name, plugin] of this.plugins) {
      if (name !== message.fromPlugin) {
        plugin.handle(conversationId, message);
      }
    }
  }

  markDone(conversationId: string): void {
    this.stateMachine.transition(conversationId, "idle");
    db.updateConversation(conversationId, { execution: "idle" });
  }

  markError(conversationId: string): void {
    this.stateMachine.transition(conversationId, "error");
    db.updateConversation(conversationId, { execution: "error" });
  }
}
