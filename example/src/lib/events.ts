import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { TrpcSyncEvent } from "trpc-db-collection/server"
import type { TrpcItem } from "trpc-db-collection"
import { eventsTable } from "@/db/schema"

export const drizzleEventsAdapter = async <TItem extends TrpcItem>(
  userId: string,
  router: string,
  db: NodePgDatabase,
  event: Omit<TrpcSyncEvent<TItem>, "id">
): Promise<TrpcSyncEvent<TItem>> => {
  const savedEvents = await db
    .insert(eventsTable)
    .values({
      router,
      userId: userId,
      action: event.action,
      data: event.data,
    })
    .returning()

  const savedEvent = savedEvents[0]
  if (!savedEvent) {
    throw new Error("Failed to save event")
  }

  return {
    id: savedEvent.id,
    userId: event.userId,
    action: event.action,
    data: event.data,
  }
}
