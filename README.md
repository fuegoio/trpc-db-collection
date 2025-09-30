# tRPC Tanstack DB Collection

[![npm version](https://img.shields.io/npm/v/trpc-db-collection.svg)](https://www.npmjs.com/package/trpc-db-collection)
[![license](https://img.shields.io/npm/l/trpc-db-collection.svg)](https://github.com/fuegoio/trpc-db-collection/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/fuegoio/trpc-db-collection.svg?style=social)](https://github.com/fuegoio/trpc-db-collection/stargazers)

**tRPC Tanstack DB Collection** is a powerful integration that combines [tRPC](https://trpc.io/) with [Tanstack DB](https://tanstack.com/db) to provide a seamless, type-safe, real-time data synchronization solution for modern web applications.

## Key Features

- **Full Type Safety**: Leverages tRPC's powerful inference system for end-to-end type safety
- **Real-time Synchronization**: Server-Sent Events (SSE) for instant updates across clients
- **Optimistic UI Updates**: Immediate UI feedback with background synchronization
- **Full Backend Control**: Unlike solutions like ElectricSQL, you maintain complete ownership of your backend
- **Easy Integration**: Simple API that works with your existing tRPC routers

## How It Works

This package provides a bridge between your tRPC routers and Tanstack DB collections. It handles:

1. **Initial Data Loading**: Fetches initial data from your tRPC `list` procedure
2. **Real-time Updates**: Subscribes to server events via SSE for instant synchronization
3. **CRUD Operations**: Provides optimized create, update, and delete operations
4. **Conflict Resolution**: Handles event deduplication and race conditions

## Installation

```bash
npm install trpc-db-collection @tanstack/react-db @tanstack/store @trpc/server
# or
pnpm add trpc-db-collection @tanstack/react-db @tanstack/store @trpc/server
# or
yarn add trpc-db-collection @tanstack/react-db @tanstack/store @trpc/server
```

## Basic Usage

### 1. Define Your tRPC Router

First, create a tRPC router that follows the required structure:

```typescript
// src/lib/trpc/todos.ts
import { router, authedProcedure } from "@/lib/trpc";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  todosTable,
  selectTodoSchema,
  createTodoSchema,
  updateTodoSchema,
} from "@/db/schema";
import { TrpcSync } from "trpc-db-collection";

type Todo = z.infer<typeof selectTodoSchema>;
const todoRouterSync = new TrpcSync<Todo>();

export const todosRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(todosTable)
      .where(eq(todosTable.userId, ctx.session.user.id));
  }),

  create: authedProcedure
    .input(createTodoSchema)
    .mutation(async ({ ctx, input }) => {
      const [newTodo] = await ctx.db
        .insert(todosTable)
        .values({ ...input, userId: ctx.session.user.id })
        .returning();

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        event: { action: "insert", data: newTodo },
      });

      return { item: newTodo, eventId };
    }),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: updateTodoSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updatedTodo] = await ctx.db
        .update(todosTable)
        .set(input.data)
        .where(eq(todosTable.id, input.id))
        .returning();

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        event: { action: "update", data: updatedTodo },
      });

      return { item: updatedTodo, eventId };
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedTodo] = await ctx.db
        .delete(todosTable)
        .where(eq(todosTable.id, input.id))
        .returning();

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        event: { action: "delete", data: deletedTodo },
      });

      return { item: deletedTodo, eventId };
    }),

  listen: authedProcedure.subscription(({ ctx }) => {
    return todoRouterSync.eventsSubscription({
      userId: ctx.session.user.id,
      signal: undefined,
      lastEventId: null,
    });
  }),
});
```

### 2. Create the Collection

```typescript
// src/lib/collections.ts
import { createCollection } from "@tanstack/react-db";
import { trpc } from "@/lib/trpc";
import { trpcCollectionOptions } from "trpc-db-collection";

export const todosCollection = createCollection(
  trpcCollectionOptions({
    name: "todos",
    trpcRouter: trpc.todos,
    rowUpdateMode: "partial", // or 'full'
  }),
);
```

### 3. Use in Your Components

```typescript
// src/routes/todos.tsx
import { useLiveQuery } from '@tanstack/react-db'
import { todosCollection } from '@/lib/collections'

function TodosPage() {
  const { data: todos } = useLiveQuery((q) =>
    q.from({ todosCollection }).orderBy('createdAt', 'desc')
  )

  return (
    <div>
      {todos.map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  )
}

function TodoItem({ todo }) {
  return (
    <div>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() =>
          todosCollection.update(todo.id, { completed: !todo.completed })}
      />
      {todo.title}
    </div>
  )
}
```

## Collection Options

The `trpcCollectionOptions` function accepts:

```typescript
interface TrpcCollectionConfig<TItem extends TrpcItem> {
  name: string;
  trpcRouter: RequiredTrpcRouter<TItem>;
  rowUpdateMode?: "partial" | "full";
  logger?: {
    enabled?: boolean;
    level?: "debug" | "info" | "error" | "none";
  };
  // Plus all standard Tanstack DB CollectionConfig options
}
```

## Real-time Synchronization

The package handles real-time synchronization through:

1. **Server-Sent Events (SSE)**: Efficient unidirectional updates from server to clients
2. **Event Deduplication**: Prevents duplicate processing of the same event
3. **Race Condition Handling**: Buffers events during initial sync to maintain consistency
4. **Optimistic Updates**: Immediate UI feedback while waiting for server confirmation

## Example Project

Check out the [example project](https://github.com/fuegoio/trpc-db-collection/tree/main/example) for a complete working implementation. It demonstrates:

- Database schema with Drizzle ORM
- Complete tRPC router implementation
- Collection setup and usage
- Route integration with Tanstack Router
- Authentication with BetterAuth

## Migration Guide

### From ElectricSQL

If you're migrating from ElectricSQL, this package provides a similar real-time experience but with:

- **Full backend control** (no vendor lock-in)
- **Complete type safety** (thanks to tRPC)
- **Simpler architecture** (no separate sync service)

### From Traditional tRPC

If you're using traditional tRPC queries and mutations:

1. Replace `trpc.todos.list.useQuery()` with `useLiveQuery` from Tanstack DB
2. Replace direct mutation calls with collection operations (`collection.insert()`, `collection.update()`, etc.)
3. Add the `listen` procedure to your router for real-time updates

## Performance Considerations

### HTTP/2 Recommendation

For optimal performance with multiple collections, use HTTP/2 to avoid browser connection limits. The example project includes Caddy configuration for this.

### Connection Management

The package automatically handles connection cleanup and reconnection logic.

## Contributing

Contributions are welcome! Please open issues for bugs or feature requests, and submit pull requests for improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Tanstack](https://tanstack.com/) for their innovative data management solutions
- [tRPC](https://trpc.io/) for the excellent type-safe API framework
- [ElectricSQL](https://electric-sql.com/) for inspiration on real-time database patterns

## Related Resources

- [Tanstack DB Documentation](https://tanstack.com/db/latest/docs/overview)
- [tRPC Documentation](https://trpc.io/docs)
- [Example Project Source](https://github.com/fuegoio/trpc-db-collection/tree/main/example)

