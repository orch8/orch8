import { describe, it, expectTypeOf } from "vitest";
import type {
  WsEvent,
  WsEventType,
  WsEventByType,
  WsChatMessageChunkEvent,
  WsNotificationNewEvent,
  WsDaemonLogEvent,
} from "@orch/shared";

/**
 * Type-only regression tests for the @orch/shared WsEvent discriminated
 * union. These protect against two classes of drift:
 *   1. A variant is deleted from the union but a handler still references it.
 *   2. The union is accidentally widened back to `{ [k: string]: unknown }`,
 *      collapsing `Extract<WsEvent, { type: "..." }>` to `never`.
 */
describe("WsEvent discriminated union (type-only)", () => {
  it("WsEventType is the union of every variant's literal", () => {
    expectTypeOf<WsEventType>().toEqualTypeOf<
      | "task_transitioned"
      | "agent_paused"
      | "agent_resumed"
      | "run_created"
      | "run_completed"
      | "run_failed"
      | "run_event"
      | "budget_alert"
      | "notification:new"
      | "verification:verdict"
      | "verification:response"
      | "verification:referee"
      | "daemon:log"
      | "daemon:stats"
      | "activity:new"
      | "comment:new"
      | "chat_message_started"
      | "chat_message_chunk"
      | "chat_message_complete"
      | "chat_message_error"
      | "chat_card_decision"
    >();
  });

  it("each WsEventByType<K> resolves to a concrete variant, not never", () => {
    expectTypeOf<WsEventByType<"chat_message_chunk">>().not.toBeNever();
    expectTypeOf<WsEventByType<"notification:new">>().not.toBeNever();
    expectTypeOf<WsEventByType<"daemon:log">>().not.toBeNever();
    expectTypeOf<WsEventByType<"run_completed">>().not.toBeNever();
  });

  it("chat_message_chunk variant has the expected fields as non-optional strings", () => {
    expectTypeOf<WsChatMessageChunkEvent>().toMatchTypeOf<{
      type: "chat_message_chunk";
      chatId: string;
      messageId: string;
      chunk: string;
    }>();
  });

  it("notification:new variant exposes notificationType (not the clobbered `type`)", () => {
    expectTypeOf<WsNotificationNewEvent>().toMatchTypeOf<{
      type: "notification:new";
      id: string;
      notificationType: string;
      title: string;
      message: string;
      link: string | null;
    }>();
  });

  it("daemon:log variant has level/message/timestamp as strings", () => {
    expectTypeOf<WsDaemonLogEvent>().toMatchTypeOf<{
      type: "daemon:log";
      level: string;
      message: string;
      timestamp: string;
    }>();
  });

  it("narrowing WsEvent by `type` picks exactly one variant", () => {
    function narrow(event: WsEvent) {
      if (event.type === "chat_message_chunk") {
        // Inside this branch, the compiler should resolve `event` to
        // WsChatMessageChunkEvent — exposing `chunk` as a string.
        expectTypeOf(event).toMatchTypeOf<WsChatMessageChunkEvent>();
        return event.chunk;
      }
      return null;
    }
    // Reference `narrow` to avoid unused-locals complaints when vitest's
    // type-only runtime does not evaluate the function body.
    void narrow;
  });
});
