import { describe, it, expect } from "vitest";
import { BroadcastService } from "../services/broadcast.service.js";

function makeFakeSocket() {
  const messages: string[] = [];
  const socket = {
    readyState: 1,
    send(data: string) { messages.push(data); },
  };
  return { socket, messages };
}

describe("BroadcastService chat events", () => {
  it("broadcasts chat_message_started with type and payload", () => {
    const fake = makeFakeSocket();
    const svc = new BroadcastService(new Set([fake.socket as any]));
    svc.chatMessageStarted("proj_1", { chatId: "chat_1", messageId: "msg_1" });
    expect(fake.messages).toHaveLength(1);
    const parsed = JSON.parse(fake.messages[0]);
    expect(parsed).toEqual({ type: "chat_message_started", chatId: "chat_1", messageId: "msg_1" });
  });

  it("broadcasts chat_message_chunk", () => {
    const fake = makeFakeSocket();
    const svc = new BroadcastService(new Set([fake.socket as any]));
    svc.chatMessageChunk("proj_1", { chatId: "chat_1", messageId: "msg_1", chunk: "hello" });
    const parsed = JSON.parse(fake.messages[0]);
    expect(parsed.type).toBe("chat_message_chunk");
    expect(parsed.chunk).toBe("hello");
  });

  it("broadcasts chat_card_decision", () => {
    const fake = makeFakeSocket();
    const svc = new BroadcastService(new Set([fake.socket as any]));
    svc.chatCardDecision("proj_1", { chatId: "chat_1", cardId: "card_1", status: "approved" });
    const parsed = JSON.parse(fake.messages[0]);
    expect(parsed).toEqual({ type: "chat_card_decision", chatId: "chat_1", cardId: "card_1", status: "approved" });
  });
});
