import type { CollectionConfig, SyncConfig } from "@tanstack/react-db";
import type { TrpcItem } from "./items";
import type { TrpcSyncEvent } from "./events";
import { Store } from "@tanstack/store";
import { type LoggerConfig, Logger } from "./logger";
import {
  type Serializer,
  jsonSerializer,
  loadFromLocalStorage,
  saveToLocalStorage,
  updateLocalStorageAfterWrite,
} from "./local-storage";

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
        onError?: (error: Error) => void;
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
  /**
   * The trpc router to use for syncing data.
   * It needs to have the following methods:
   * - list: query to get all items
   * - create: mutation to create an item
   * - update: mutation to update an item
   * - delete: mutation to delete an item
   * - listen: subscription to listen for changes
   */
  trpcRouter: RequiredTrpcRouter<TItem>;

  /**
   * The name of the collection.
   */
  name: string;

  /**
   * The row update mode to use for syncing data.
   * @default "partial"
   */
  rowUpdateMode?: "partial" | "full";

  /**
   * The logger configuration to use for logging.
   */
  loggerConfig?: LoggerConfig;

  /**
   * The serializer to use for local storage.
   * @default jsonSerializer
   */
  serializer?: Serializer;

  /**
   * Whether to enable local storage sync.
   * @default true
   */
  localStorage?: boolean;
}

export function trpcCollectionOptions<TItem extends TrpcItem>(
  config: TrpcCollectionConfig<TItem>,
): CollectionConfig<TItem> {
  const logger = new Logger(config.loggerConfig, config.name);
  const serializer = config.serializer ?? jsonSerializer;
  const localStorageSyncEnabled = config.localStorage ?? true;

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
        onData: (event) => {
          logger.info("Received sync event", event);

          // Handle both array and object formats
          // This is quite useful as tRPC expects a rigorous SSE format
          // that is not always correctly proxied by some servers.
          if (Array.isArray(event)) {
            event = { id: event[0], data: event[1] };
          }

          const { data } = event;
          if (!isInitialSyncComplete) {
            // Buffer events during initial sync to prevent race conditions
            eventBuffer.push(data);
            return;
          }

          // Process real-time events
          begin();
          write({ type: data.action, value: data.data });
          commit();

          if (localStorageSyncEnabled) {
            updateLocalStorageAfterWrite(data.action, data.data, {
              name: config.name,
              logger,
              localStorageSyncEnabled,
            });
          }

          receivedEventIds.setState((prev) => new Set([...prev, data.id]));
          lastEventId = data.id;
        },
        onError: (error) => {
          logger.error("Sync error:", error);
        },
      },
    );

    // 3. Perform initial data fetch
    async function initialSync() {
      logger.info("Starting initial sync");
      try {
        // Try to load from local storage first if enabled
        const cachedData = localStorageSyncEnabled
          ? loadFromLocalStorage<TItem[]>(config.name)
          : null;

        begin(); // Start a transaction

        if (localStorageSyncEnabled && cachedData && cachedData.length > 0) {
          logger.info(
            "Loaded data from local storage",
            cachedData.length,
            "items",
          );
          for (const item of cachedData) {
            write({
              type: "insert",
              value: item,
            });
          }
          commit(); // Commit cached data
        }

        // Then fetch from network and update
        const networkData = await config.trpcRouter.list.query();

        // Clear existing data if we have network data
        if (networkData.length > 0) {
          begin();
          // Clear existing data by removing all items
          for (const item of cachedData || []) {
            write({
              type: "delete",
              value: item,
            });
          }

          // Add network data
          for (const item of networkData) {
            write({
              type: "insert",
              value: item,
            });
          }
          commit();

          // Save to local storage if enabled
          if (localStorageSyncEnabled) {
            saveToLocalStorage(config.name, networkData, serializer);
            logger.info(
              "Saved data to local storage",
              networkData.length,
              "items",
            );
          }
        }

        // 4. Process buffered events
        isInitialSyncComplete = true;
        if (eventBuffer.length > 0) {
          begin();
          for (const event of eventBuffer) {
            write({ type: event.action, value: event.data });
          }
          commit();

          if (localStorageSyncEnabled) {
            for (const event of eventBuffer) {
              updateLocalStorageAfterWrite(event.action, event.data, {
                name: config.name,
                logger,
                serializer,
                localStorageSyncEnabled,
              });
            }
          }
          eventBuffer.splice(0);
        }

        logger.info("Initial sync complete");
      } catch (error) {
        logger.error("Initial sync failed:", error);
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
    };
  };

  const awaitEventId = (eventId: number): Promise<boolean> => {
    logger.debug("Waiting for event id", eventId);
    if (receivedEventIds.state.has(eventId)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const unsubscribe = receivedEventIds.subscribe(() => {
        if (receivedEventIds.state.has(eventId)) {
          unsubscribe();
          resolve(true);
          logger.debug("Received event id", eventId);
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
      logger.info("Inserting item", modified);
      const result = await config.trpcRouter.create.mutate({
        ...modified,
      });
      await awaitEventId(result.eventId);

      // Update local storage after insert if enabled
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("insert", result.item, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled,
        });
      }

      return { result };
    },

    onUpdate: async ({ transaction }) => {
      const { modified, changes } = transaction.mutations[0];
      logger.info("Updating item", modified, changes);
      const result = await config.trpcRouter.update.mutate({
        id: modified.id,
        data: changes,
      });
      await awaitEventId(result.eventId);

      // Update local storage after update if enabled
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("update", result.item, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled,
        });
      }

      return { result };
    },

    onDelete: async ({ transaction }) => {
      const { modified } = transaction.mutations[0];
      logger.info("Deleting item", modified);
      const result = await config.trpcRouter.delete.mutate({
        id: modified.id,
      });
      await awaitEventId(result.eventId);

      // Update local storage after delete if enabled
      if (localStorageSyncEnabled) {
        updateLocalStorageAfterWrite("delete", modified, {
          name: config.name,
          logger,
          serializer,
          localStorageSyncEnabled,
        });
      }

      return { result };
    },
  };
}
