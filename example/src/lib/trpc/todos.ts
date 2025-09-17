import { router, authedProcedure } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, arrayContains, or } from "drizzle-orm"
import {
  todosTable,
  createTodoSchema,
  updateTodoSchema,
  projectsTable,
  type Todo,
} from "@/db/schema"
import { TrpcSync } from "trpc-db-collection/server"
import { drizzleEventsAdapter } from "../events"

const todoRouterSync = new TrpcSync<Todo>()

export const todosRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const todos = await ctx.db
      .select({ todos: todosTable })
      .from(todosTable)
      .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
      .where(
        or(
          arrayContains(projectsTable.sharedUserIds, [ctx.session.user.id]),
          eq(projectsTable.ownerId, ctx.session.user.id)
        )
      )

    return todos.map((row) => row.todos)
  }),

  create: authedProcedure
    .input(createTodoSchema)
    .mutation(async ({ ctx, input }) => {
      const projects = await ctx.db
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, input.projectId),
            or(
              arrayContains(projectsTable.sharedUserIds, [ctx.session.user.id]),
              eq(projectsTable.ownerId, ctx.session.user.id)
            )
          )
        )
      const project = projects[0]
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found or you do not have permission to it",
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const [newItem] = await tx.insert(todosTable).values(input).returning()
        return newItem
      })

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        otherUserIds: project.sharedUserIds.concat(project.ownerId),
        event: {
          action: "insert",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Todo>(
            ctx.session.user.id,
            "todos",
            ctx.db,
            event
          ),
      })

      return { item: result, eventId }
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.number(),
        data: updateTodoSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const todos = await ctx.db
        .select()
        .from(todosTable)
        .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
        .where(
          and(
            eq(todosTable.id, input.id),
            or(
              arrayContains(projectsTable.sharedUserIds, [ctx.session.user.id]),
              eq(projectsTable.ownerId, ctx.session.user.id)
            )
          )
        )
      const todo = todos[0]
      if (!todo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Todo not found or you do not have permission to it",
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const [updatedItem] = await tx
          .update(todosTable)
          .set(input.data)
          .where(eq(todosTable.id, input.id))
          .returning()

        if (!updatedItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Todo not found or you do not have permission to update it",
          })
        }

        return updatedItem
      })

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        otherUserIds: todo.projects!.sharedUserIds.concat(
          todo.projects!.ownerId
        ),
        event: {
          action: "update",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Todo>(
            ctx.session.user.id,
            "todos",
            ctx.db,
            event
          ),
      })

      return { item: result, eventId: eventId }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const todos = await ctx.db
        .select()
        .from(todosTable)
        .leftJoin(projectsTable, eq(todosTable.projectId, projectsTable.id))
        .where(
          and(
            eq(todosTable.id, input.id),
            or(
              arrayContains(projectsTable.sharedUserIds, [ctx.session.user.id]),
              eq(projectsTable.ownerId, ctx.session.user.id)
            )
          )
        )
      const todo = todos[0]
      if (!todo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Todo not found or you do not have permission to it",
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const [deletedItem] = await tx
          .delete(todosTable)
          .where(eq(todosTable.id, input.id))
          .returning()

        if (!deletedItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Todo not found or you do not have permission to delete it",
          })
        }

        return deletedItem
      })

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        otherUserIds: todo.projects!.sharedUserIds.concat(
          todo.projects!.ownerId
        ),
        event: {
          action: "delete",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Todo>(
            ctx.session.user.id,
            "todos",
            ctx.db,
            event
          ),
      })

      return { item: result, eventId: eventId }
    }),

  listen: authedProcedure
    .input(
      z
        .object({
          lastEventId: z.coerce.number().nullish(),
        })
        .optional()
    )
    .subscription(async function* (opts) {
      yield* todoRouterSync.eventsSubscription({
        userId: opts.ctx.session.user.id,
        signal: opts.signal,
        lastEventId: opts.input?.lastEventId,
        fetchLastEvents: async () => {
          return []
        },
      })
    }),
})
