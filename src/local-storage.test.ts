import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  clearLocalStorage,
  jsonSerializer,
} from "./local-storage";

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

global.localStorage = mockLocalStorage as any;

describe("LocalStoragePersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should load data from localStorage", () => {
    // Mock the getItem to return some data
    mockLocalStorage.getItem.mockReturnValue(
      JSON.stringify({
        items: [{ id: 1, title: "Test" }],
        timestamp: Date.now(),
      }),
    );

    const data = loadFromLocalStorage("test-collection", jsonSerializer);
    expect(data).toEqual({
      items: [{ id: 1, title: "Test" }],
      timestamp: expect.any(Number),
    });
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith(
      "trpc-db-collection-test-collection",
    );
  });

  it("should save data to localStorage", () => {
    const data = { items: [{ id: 1, title: "Test" }], timestamp: Date.now() };
    saveToLocalStorage("test-collection", data, jsonSerializer);

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "trpc-db-collection-test-collection",
      JSON.stringify(data),
    );
  });

  it("should clear data from localStorage", () => {
    clearLocalStorage("test-collection");
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      "trpc-db-collection-test-collection",
    );
  });

  it("should handle empty data in localStorage", () => {
    // Mock the getItem to return null (empty)
    mockLocalStorage.getItem.mockReturnValue(null);

    const data = loadFromLocalStorage("test-collection", jsonSerializer);
    expect(data).toBeNull();
  });

  it("should handle custom serializer", () => {
    const customSerializer = {
      parse: vi.fn((text) => JSON.parse(text)),
      stringify: vi.fn((value) => JSON.stringify(value)),
    };

    // Mock the getItem to return some data
    mockLocalStorage.getItem.mockReturnValue(
      JSON.stringify({
        items: [{ id: 1, title: "Test" }],
        timestamp: Date.now(),
      }),
    );

    const data = loadFromLocalStorage("test-collection", customSerializer);
    expect(data).toEqual({
      items: [{ id: 1, title: "Test" }],
      timestamp: expect.any(Number),
    });
    expect(customSerializer.parse).toHaveBeenCalled();

    saveToLocalStorage("test-collection", data, customSerializer);
    expect(customSerializer.stringify).toHaveBeenCalled();
  });
});
