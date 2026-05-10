import type { Message } from "./conversation.js";
import type { CoreApi } from "./core.js";

export interface Plugin {
  readonly name: string;

  /** Core 调用：有消息给这个 Plugin */
  handle(conversationId: string, message: Message): void;
}
