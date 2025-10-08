import { describe, it, expect, vi } from "vitest";
import { TrpcSync, type TrpcSyncEvent } from "./events";

describe("TrpcSync", () => {
  it("should initialize with empty events", () => {
    const sync = new TrpcSync();
    expect(sync).toBeDefined();
  });

  it("should register events", async () => {
    const sync = new TrpcSync();
    const saveEvent = vi.fn(async (event) => ({ ...event, id: 1 }));

    const eventId = await sync.registerEvent({
      currentUserId: "user1",
      event: { action: "insert", data: { id: 1, title: "Test" } } as Omit<
        TrpcSyncEvent<any>,
        "id" | "userId"
      >,
      saveEvent,
    });

    expect(eventId).toBe(1);
    expect(saveEvent).toHaveBeenCalled();
  });

  it("should handle multiple events", async () => {
    const sync = new TrpcSync();
    const saveEvent = vi
      .fn()
      .mockImplementationOnce(async (event) => ({ ...event, id: 1 }))
      .mockImplementationOnce(async (event) => ({ ...event, id: 2 }));

    await sync.registerEvent({
      currentUserId: "user1",
      event: { action: "insert", data: { id: 1, title: "Test 1" } } as Omit<
        TrpcSyncEvent<any>,
        "id" | "userId"
      >,
      saveEvent,
    });
    await sync.registerEvent({
      currentUserId: "user1",
      event: { action: "insert", data: { id: 2, title: "Test 2" } } as Omit<
        TrpcSyncEvent<any>,
        "id" | "userId"
      >,
      saveEvent,
    });

    expect(saveEvent).toHaveBeenCalledTimes(2);
  });

  it("should handle events subscription", async () => {
    const sync = new TrpcSync();
    const saveEvent = vi.fn(async (event) => ({ ...event, id: 1 }));

    // Register an event first
    await sync.registerEvent({
      currentUserId: "user1",
      event: { action: "insert", data: { id: 1, title: "Test" } } as Omit<
        TrpcSyncEvent<any>,
        "id" | "userId"
      >,
      saveEvent,
    });

    // Just verify that the eventsSubscription method exists and can be called
    const iterable = sync.eventsSubscription({
      userId: "user1",
      signal: undefined,
      lastEventId: null,
    });

    expect(iterable).toBeDefined();
    expect(typeof iterable[Symbol.asyncIterator]).toBe("function");
  });
});

