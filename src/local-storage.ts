import type { TrpcItem } from "./items";
import type { Logger } from "./logger";

export interface Serializer {
  parse: <T>(text: string) => T;
  stringify: <T>(value: T) => string;
}

// Default JSON serializer
export const jsonSerializer: Serializer = {
  parse: <T>(text: string) => JSON.parse(text) as T,
  stringify: <T>(value: T) => JSON.stringify(value),
};

export function getLocalStorageKey(collectionName: string): string {
  return `trpc-db-collection-${collectionName}`;
}

export function loadFromLocalStorage<T>(
  collectionName: string,
  serializer: Serializer,
): T | null {
  try {
    const key = getLocalStorageKey(collectionName);
    const data = localStorage.getItem(key);
    return data ? (serializer.parse(data) as T) : null;
  } catch (error) {
    console.error(
      `Failed to load from local storage for ${collectionName}:`,
      error,
    );
    return null;
  }
}

export function saveToLocalStorage<T>(
  collectionName: string,
  data: T,
  serializer: Serializer,
): void {
  try {
    const key = getLocalStorageKey(collectionName);
    localStorage.setItem(key, serializer.stringify(data));
  } catch (error) {
    console.error(
      `Failed to save to local storage for ${collectionName}:`,
      error,
    );
  }
}

export function clearLocalStorage(collectionName: string): void {
  try {
    const key = getLocalStorageKey(collectionName);
    localStorage.removeItem(key);
  } catch (error) {
    console.error(
      `Failed to clear local storage for ${collectionName}:`,
      error,
    );
  }
}

// Helper function to update local storage after write operations
export function updateLocalStorageAfterWrite<TItem extends TrpcItem>(
  operation: "insert" | "update" | "delete",
  item: TItem,
  config: {
    name: string;
    logger: Logger;
    serializer: Serializer;
    localStorageSyncEnabled?: boolean;
  },
) {
  // Skip if local storage sync is disabled
  if (config.localStorageSyncEnabled === false) {
    return;
  }

  try {
    // Load current data from local storage
    const currentData =
      loadFromLocalStorage<TItem[]>(config.name, config.serializer) || [];

    let updatedData: TItem[];

    switch (operation) {
      case "insert":
        // Add new item (avoid duplicates)
        updatedData = [...currentData, item];
        break;
      case "update":
        // Update existing item
        updatedData = currentData.map((existingItem) =>
          existingItem.id === item.id
            ? { ...existingItem, ...item }
            : existingItem,
        );
        break;
      case "delete":
        // Remove item
        updatedData = currentData.filter(
          (existingItem) => existingItem.id !== item.id,
        );
        break;
    }

    // Save updated data back to local storage
    saveToLocalStorage(config.name, updatedData, config.serializer);
    config.logger.info(`Updated local storage after ${operation}`, item);
  } catch (error) {
    config.logger.error(
      `Failed to update local storage after ${operation}:`,
      error,
    );
  }
}
