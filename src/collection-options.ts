import type { CollectionConfig, SyncConfig } from "@tanstack/react-db";
import type { TrpcItem } from "./items";
import type { TrpcSyncEvent } from "./events";
import { Store } from "@tanstack/store";

interface TrpcMutationResponse<TItem extends TrpcItem> {
  item: TItem;
  eventId: number;
}

interface RequiredTrpcRouter<TItem extends TrpcItem> {
  list: {
    query: () => Promise<TItem[]>;
  };
  create: {
    mutate: (input: Omit<TItem, "id">) => Promise<TrpcMutationResponse<TItem>>;
  };
  update: {
    mutate: (input: {
      id: TItem["id"];
      data: Partial<TItem>;
    }) => Promise<TrpcMutationResponse<TItem>>;
  };
  delete: {
    mutate: (input: {
      id: TItem["id"];
    }) => Promise<TrpcMutationResponse<TItem>>;
  };
  listen: {
    subscribe: (
      input: { lastEventId: number | null },
      opts: {
        onData: (data: { id: string; data: TrpcSyncEvent<TItem> }) => void;
      },
    ) => {
      unsubscribe: () => void;
    };
  };
}

interface TrpcCollectionConfig<TItem extends TrpcItem>
  extends Omit<
    CollectionConfig<TItem>,
    "onInsert" | "onUpdate" | "onDelete" | "sync" | "getKey"
  > {
  trpcRouter: RequiredTrpcRouter<TItem>;

  rowUpdateMode?: "partial" | "full";
}

export function trpcCollectionOptions<TItem extends TrpcItem>(
  config: TrpcCollectionConfig<TItem>,
): CollectionConfig<TItem> {
  const receivedEventIds = new Store<Set<number>>(new Set());

  const sync: SyncConfig<TItem>["sync"] = (params) => {
    const { begin, write, commit, markReady } = params;

    let lastEventId = null;

    // 1. Set up real-time subscription FIRST (prevents race conditions)
    const eventBuffer: Array<TrpcSyncEvent<TItem>> = [];
    let isInitialSyncComplete = false;

    // 2. Initialize connection to your sync engine
    const subscription = config.trpcRouter.listen.subscribe(
      { lastEventId },
      {
        onData: ({ data }) => {
          if (!isInitialSyncComplete) {
            // Buffer events during initial sync to prevent race conditions
            eventBuffer.push(data);
            return;
          }

          // Process real-time events
          begin();
          write({ type: data.action, value: data.data });
          commit();

          receivedEventIds.setState((prev) => new Set([...prev, data.id]));
          lastEventId = data.id;
        },
      },
    );

    // 3. Perform initial data fetch
    async function initialSync() {
      try {
        const data = await config.trpcRouter.list.query();

        begin(); // Start a transaction

        for (const item of data) {
          write({
            type: "insert",
            value: item,
          });
        }

        commit(); // Commit the transaction

        // 4. Process buffered events
        isInitialSyncComplete = true;
        if (eventBuffer.length > 0) {
          begin();
          for (const event of eventBuffer) {
            // Deduplicate if necessary based on your sync engine
            write({ type: event.action, value: event.data });
          }
          commit();
          eventBuffer.splice(0);
        }
      } catch (error) {
        console.error("Initial sync failed:", error);
        throw error;
      } finally {
        // ALWAYS call markReady, even on error
        markReady();
      }
    }

    initialSync();

    // 4. Return cleanup function
    return () => {
      subscription.unsubscribe();
      // Clean up any timers, intervals, or other resources
    };
  };

  const awaitEventId = (eventId: number): Promise<boolean> => {
    if (receivedEventIds.state.has(eventId)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const unsubscribe = receivedEventIds.subscribe(() => {
        if (receivedEventIds.state.has(eventId)) {
          unsubscribe();
          resolve(true);
        }
      });
    });
  };

  return {
    ...config,
    getKey: (item) => item.id,
    sync: {
      sync,
      rowUpdateMode: config.rowUpdateMode ?? "partial",
    },
    onInsert: async ({ transaction }) => {
      const { modified } = transaction.mutations[0];
      const result = await config.trpcRouter.create.mutate({
        ...modified,
      });
      await awaitEventId(result.eventId);
      return { result };
    },

    onUpdate: async ({ transaction }) => {
      const { modified, changes } = transaction.mutations[0];
      const result = await config.trpcRouter.update.mutate({
        id: modified.id,
        data: changes,
      });
      await awaitEventId(result.eventId);
      return { result };
    },

    onDelete: async ({ transaction }) => {
      const { modified } = transaction.mutations[0];
      const result = await config.trpcRouter.delete.mutate({
        id: modified.id,
      });
      await awaitEventId(result.eventId);
      return { result };
    },
  };
}
