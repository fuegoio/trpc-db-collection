import { describe, it, expect, vi } from "vitest";
import { trpcCollectionOptions } from "./collection-options";

// Mock the required dependencies
const mockTrpcRouter = {
  list: {
    query: vi.fn(async () => [{ id: 1, title: "Test Item" }]),
  },
  create: {
    mutate: vi.fn(async (input) => ({ item: { id: 2, ...input }, eventId: 1 })),
  },
  update: {
    mutate: vi.fn(async (input) => ({
      item: { id: input.id, ...input.data },
      eventId: 1,
    })),
  },
  delete: {
    mutate: vi.fn(async (input) => ({ item: { id: input.id }, eventId: 1 })),
  },
  listen: {
    subscribe: vi.fn((_, { onData }) => {
      // Simulate receiving an event
      onData({
        id: "1",
        data: { id: 1, action: "insert", data: { id: 1, title: "Test Item" } },
      });
      return { unsubscribe: vi.fn() };
    }),
  },
};

describe("trpcCollectionOptions", () => {
  it("should handle insert operations", async () => {
    const config = trpcCollectionOptions({
      name: "todos",
      trpcRouter: mockTrpcRouter as any,
    });

    // Call the onInsert handler directly
    const result = await config.onInsert?.({
      transaction: {
        mutations: [
          {
            modified: { id: 2, title: "New Item" },
          },
        ],
      },
    } as any);

    // Check that the create mutation was called
    expect(mockTrpcRouter.create.mutate).toHaveBeenCalledWith({
      id: 2,
      title: "New Item",
    });

    // Check that the result is correct
    expect(result).toBeDefined();
  }, 10000); // Increase timeout

  it("should handle update operations", async () => {
    const config = trpcCollectionOptions({
      name: "todos",
      trpcRouter: mockTrpcRouter as any,
    });

    // Call the onUpdate handler directly
    const result = await config.onUpdate?.({
      transaction: {
        mutations: [
          {
            modified: { id: 1, title: "Test Item" },
            changes: { title: "Updated Item" },
          },
        ],
      },
    } as any);

    // Check that the update mutation was called
    expect(mockTrpcRouter.update.mutate).toHaveBeenCalledWith({
      id: 1,
      data: { title: "Updated Item" },
    });

    // Check that the result is correct
    expect(result).toBeDefined();
  }, 10000); // Increase timeout

  it("should handle delete operations", async () => {
    const config = trpcCollectionOptions({
      name: "todos",
      trpcRouter: mockTrpcRouter as any,
    });

    // Call the onDelete handler directly
    const result = await config.onDelete?.({
      transaction: {
        mutations: [
          {
            modified: { id: 1, title: "Test Item" },
          },
        ],
      },
    } as any);

    // Check that the delete mutation was called
    expect(mockTrpcRouter.delete.mutate).toHaveBeenCalledWith({ id: 1 });

    // Check that the result is correct
    expect(result).toBeDefined();
  });
});

