import * as lark from "@larksuiteoapi/node-sdk";
import type { Plugin, CoreApi, Message } from "../../types/index.js";
import { readFile, writeFile, chmod, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

// --- Poll cursor 持久化 ---

const CURSOR_DIR = "data/poll-cursors";

function getCursorPath(chatId: string): string {
  return join(CURSOR_DIR, `${chatId}.txt`);
}

async function getCursor(chatId: string): Promise<number> {
  try {
    const val = await readFile(getCursorPath(chatId), "utf-8");
    return parseInt(val.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

async function setCursor(chatId: string, timestamp: number): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(CURSOR_DIR, { recursive: true });
  await writeFile(getCursorPath(chatId), timestamp.toString(), "utf-8");
}

// --- Config ---

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  pollIntervalMs?: number;
}

// --- Plugin ---

export class FeishuPlugin implements Plugin {
  readonly name = "feishu";
  private core!: CoreApi;
  private client!: lark.Client;
  private config: FeishuConfig;
  private pollTimer?: ReturnType<typeof setInterval>;
  private cachedChats: Array<{ chatId: string }> = [];
  private chatsCachedAt = 0;
  private readonly CHAT_CACHE_TTL = 5 * 60 * 1000;

  constructor(config: FeishuConfig) {
    this.config = config;
  }

  init(core: CoreApi): void {
    this.core = core;
    this.client = new lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: lark.AppType.SelfBuild,
    });
  }

  async start(): Promise<void> {
    // 验证 Bot 凭证
    try {
      const resp = await this.client.request({ method: "GET", url: "/open-apis/bot/v3/info/" });
      const bot = (resp?.data as any)?.bot;
      console.log(`[FeishuPlugin] Bot connected: ${bot?.app_name} (${bot?.open_id})`);
    } catch (err) {
      throw new Error(`Feishu Bot auth failed: ${err}`);
    }

    // 启动轮询
    const interval = this.config.pollIntervalMs ?? 3000;
    const poll = async () => {
      await this.pollOnce();
    };
    // 立即执行一次，然后定时轮询
    poll().catch((err) => console.error("[FeishuPlugin] Poll error:", err));
    this.pollTimer = setInterval(() => {
      poll().catch((err) => console.error("[FeishuPlugin] Poll error:", err));
    }, interval);
    console.log(`[FeishuPlugin] Polling started (interval: ${interval}ms)`);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  // --- Core calls this when there's a message for Feishu ---

  handle(conversationId: string, message: Message): void {
    const groupId = this.core.getConversation(conversationId)?.bindings?.["feishu"];
    if (!groupId) return;

    if (message.type === "text" || message.type === "system") {
      this.sendText(groupId, message.content).catch((err) =>
        console.error(`[FeishuPlugin] Send failed:`, err)
      );
      return;
    }

    console.log(`[FeishuPlugin] Unsupported message type: ${message.type}`);
  }

  // --- Send methods ---

  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  }

  async sendImage(chatId: string, imagePath: string): Promise<void> {
    const imageBuffer = await readFile(imagePath);
    const uploadResp = await this.client.im.image.create({
      data: { image_type: "message", image: imageBuffer } as any,
    });
    const imageKey = uploadResp?.image_key;
    if (!imageKey) throw new Error("Failed to upload image");

    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "image",
        content: JSON.stringify({ image_key: imageKey }),
      },
    });
  }

  async sendFile(chatId: string, filePath: string, fileName?: string): Promise<void> {
    const fileBuffer = await readFile(filePath);
    const name = fileName || filePath.split("/").pop() || "file";
    const ext = (filePath.split(".").pop() || "bin") as "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
    const uploadResp = await this.client.im.file.create({
      data: { file_type: ext, file_name: name, file: fileBuffer } as any,
    });
    const fileKey = uploadResp?.file_key;
    if (!fileKey) throw new Error("Failed to upload file");

    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "file",
        content: JSON.stringify({ file_key: fileKey }),
      },
    });
  }

  // --- Group management ---

  async createGroup(name: string, ownerId: string, userIds: string[]): Promise<string> {
    const allMembers = [...new Set([ownerId, ...userIds])];
    const resp = await this.client.im.chat.create({
      data: {
        name,
        chat_mode: "group",
        chat_type: "public",
        owner_id: ownerId,
        user_id_list: allMembers,
      },
    });
    const chatId = (resp?.data as any)?.chat_id;
    if (!chatId) throw new Error("Failed to create group");
    return chatId;
  }

  // --- Polling ---

  private async pollOnce(): Promise<void> {
    const chats = await this.getBotGroups();
    for (const chat of chats) {
      try {
        await this.pollGroup(chat.chatId);
      } catch (err) {
        console.error(`[FeishuPlugin] Poll group ${chat.chatId} error:`, err);
      }
    }
  }

  private async pollGroup(chatId: string): Promise<void> {
    const cursor = await getCursor(chatId);
    const items = await this.fetchMessages(chatId, cursor);
    if (items.length === 0) return;

    let maxCreateTime = 0;
    for (const item of items) {
      const parsed = this.parseMessage(item);
      if (!parsed) continue;

      const conv = this.findOrCreateConversation(chatId);
      this.core.send(conv.id, {
        conversationId: conv.id,
        fromPlugin: this.name,
        content: parsed.content,
        timestamp: Date.now(),
        type: "text",
      });

      // 文件/图片消息，先发文本通知，再转发文件给 CC
      if (parsed.fileKey && parsed.msgType) {
        const downloaded = await this.downloadMedia(parsed.fileKey, parsed.msgType);
        console.log(`[FeishuPlugin] Downloaded ${parsed.msgType}: ${downloaded}`);
      }

      const ct = parseInt((item.create_time as string) ?? "0", 10);
      if (ct > maxCreateTime) maxCreateTime = ct;
    }

    if (maxCreateTime > 0) {
      await setCursor(chatId, Math.floor(maxCreateTime / 1000));
    }
  }

  private async getBotGroups(): Promise<Array<{ chatId: string }>> {
    if (Date.now() - this.chatsCachedAt < this.CHAT_CACHE_TTL && this.cachedChats.length > 0) {
      return this.cachedChats;
    }

    const chats: Array<{ chatId: string }> = [];
    let pageToken: string | undefined;

    do {
      const resp = await this.client.im.chat.list({
        params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
      });
      for (const item of resp?.data?.items ?? []) {
        if (item.chat_id) chats.push({ chatId: item.chat_id });
      }
      pageToken = resp?.data?.has_more ? resp?.data?.page_token : undefined;
    } while (pageToken);

    this.cachedChats = chats;
    this.chatsCachedAt = Date.now();
    return chats;
  }

  private async fetchMessages(chatId: string, startTime: number): Promise<any[]> {
    const items: any[] = [];
    let pageToken: string | undefined;

    do {
      const resp = await this.client.im.message.list({
        params: {
          container_id_type: "chat",
          container_id: chatId,
          start_time: String(startTime),
          sort_type: "ByCreateTimeAsc",
          page_size: 50,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      for (const item of resp?.data?.items ?? []) {
        items.push(item);
      }
      pageToken = resp?.data?.has_more ? resp?.data?.page_token : undefined;
    } while (pageToken);

    return items;
  }

  private parseMessage(item: any): { content: string; fileKey?: string; msgType?: string } | null {
    const senderType = item.sender?.sender_type;
    if (senderType === "app") return null; // 忽略 Bot 自己发的消息

    const msgType = item.msg_type;
    const body = JSON.parse(item.body?.content ?? "{}");
    const chatId = item.chat_id;

    if (msgType === "text") {
      let text = body.text ?? "";
      text = text.replace(/@_user_\d+\s*/g, "").trim(); // 去掉 @提及
      if (!text) return null;
      return { content: text };
    }

    if (msgType === "image" && body.image_key) {
      return { content: `[Image: ${body.image_key}]`, fileKey: body.image_key, msgType: "image" };
    }

    if (msgType === "file" && body.file_key) {
      return { content: `[File: ${body.file_name || "unknown"}]`, fileKey: body.file_key, msgType: "file" };
    }

    return null;
  }

  private findOrCreateConversation(chatId: string): { id: string } {
    const existing = this.core.listConversations().find(
      (c) => c.bindings["feishu"] === chatId
    );
    if (existing) return existing;
    return this.core.createConversation(`feishu-${chatId.slice(0, 8)}`, ["feishu", "claude-code"], {
      bindings: { feishu: chatId },
    });
  }

  private async downloadMedia(fileKey: string, msgType: string): Promise<string> {
    const tmpPath = `data/downloads/${fileKey}.tmp`;
    const destPath = `data/downloads/${fileKey}.${msgType === "image" ? "png" : "file"}`;

    const resp = await this.client.im.messageResource.get({
      path: { message_id: "0", file_key: fileKey },
      params: { type: msgType as "image" | "file" },
    });

    if (typeof (resp as any).writeFile === "function") {
      await (resp as any).writeFile(tmpPath);
    } else {
      const { mkdir } = await import("node:fs/promises");
      await mkdir("data/downloads", { recursive: true });
      await writeFile(tmpPath, resp as any);
    }

    await chmod(tmpPath, 0o600);
    await rename(tmpPath, destPath);
    return destPath;
  }
}
