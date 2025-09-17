import EventEmitter, { on } from "events";
import type { TrpcItem } from "./items";
import { tracked } from "@trpc/server";

export interface TrpcSyncEvent<TItem extends TrpcItem> {
  id: number;
  action: "insert" | "update" | "delete";
  data: TItem;
  userId: string;
}

interface EventsEmitterEvents<TItem extends TrpcItem> {
  event: [userId: string, data: TrpcSyncEvent<TItem>];
}

class IterableEventEmitter<TItem extends TrpcItem> extends EventEmitter<
  EventsEmitterEvents<TItem>
> {
  toIterable<TEventName extends keyof EventsEmitterEvents<TItem>>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<EventsEmitterEvents<TItem>[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

export class TrpcSync<TItem extends TrpcItem> {
  ee: IterableEventEmitter<TItem>;

  constructor() {
    this.ee = new IterableEventEmitter();
  }

  async *eventsSubscription(opts: {
    userId: string;
    signal: AbortSignal | undefined;
    lastEventId?: number | null;
    fetchLastEvents?: (lastEventId: number) => Promise<TrpcSyncEvent<TItem>[]>;
  }) {
    const iterable = this.ee.toIterable("event", {
      signal: opts.signal,
    });

    if (opts.lastEventId && opts.fetchLastEvents) {
      const lastEvents = await opts.fetchLastEvents(opts.lastEventId);
      for (const event of lastEvents) {
        if (event.userId === opts.userId) {
          yield tracked(event.id.toString(), event);
        }
      }
    }

    for await (const [userId, data] of iterable) {
      if (userId === opts.userId) {
        yield tracked(data.id.toString(), data);
      }
    }
  }

  async registerEvent({
    currentUserId,
    otherUserIds,
    event,
    saveEvent,
  }: {
    currentUserId: string;
    otherUserIds?: string[];
    event: Omit<TrpcSyncEvent<TItem>, "id" | "userId">;
    saveEvent: (
      event: Omit<TrpcSyncEvent<TItem>, "id">,
    ) => Promise<TrpcSyncEvent<TItem>>;
  }) {
    const currentUserEvent = await saveEvent({
      ...event,
      userId: currentUserId,
    });
    this.ee.emit("event", currentUserId, currentUserEvent);

    if (!otherUserIds) return currentUserEvent.id;

    // We can send an event to other users in parallel
    for (const userId of otherUserIds) {
      // Skip the current user
      if (userId === currentUserId) continue;

      const savedEvent = await saveEvent({
        ...event,
        userId,
      });
      this.ee.emit("event", userId, savedEvent);
    }

    return currentUserEvent.id;
  }
}
