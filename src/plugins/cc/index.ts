import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Plugin, CoreApi, Message } from "../../types/index.js";

export class CCPlugin implements Plugin {
  readonly name = "claude-code";
  private core!: CoreApi;
  private abortControllers = new Map<string, AbortController>();
  private queue: Array<{ conversationId: string; message: Message }> = [];

  init(core: CoreApi): void {
    this.core = core;
  }

  handle(conversationId: string, message: Message): void {
    // executing 时排队
    if (this.abortControllers.has(conversationId)) {
      this.queue.push({ conversationId, message });
      return;
    }

    this.execute(conversationId, message);
  }

  private async execute(conversationId: string, message: Message): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(conversationId, controller);

    try {
      const conv = this.core.getConversation(conversationId);
      const sessionId = conv?.bindings?.["claude-code"];

      const q = query({
        prompt: message.content,
        options: {
          cwd: (conv?.context?.workingDirectory as string) || process.cwd(),
          ...(sessionId ? { resume: sessionId, persistSession: true } : { persistSession: true }),
          abortController: controller,
        },
      });

      for await (const event of q as any) {
        if (controller.signal.aborted) break;

        if (event.type === "system" && event.subtype === "init" && event.session_id) {
          this.core.updateConversation(conversationId, {
            bindings: { ...conv!.bindings, "claude-code": event.session_id },
          });
        }

        if (event.type === "assistant") {
          const text = (event.message?.content as any[])?.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") || "";
          if (text) {
            this.core.send(conversationId, {
              conversationId,
              fromPlugin: this.name,
              content: text,
              timestamp: Date.now(),
              type: "text",
            });
          }
        }

        if (event.type === "result" && event.subtype !== "success") {
          this.core.markError(conversationId);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error(`[CCPlugin] Error:`, err.message);
        this.core.markError(conversationId);
      }
    } finally {
      this.abortControllers.delete(conversationId);
      this.core.markDone(conversationId);

      const next = this.queue.shift();
      if (next) {
        this.execute(next.conversationId, next.message);
      }
    }
  }

  abort(conversationId: string): void {
    this.abortControllers.get(conversationId)?.abort();
    this.queue = this.queue.filter((m) => m.conversationId !== conversationId);
  }
}
