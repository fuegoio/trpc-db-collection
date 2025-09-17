import { router, authedProcedure } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { eq, and, gt, arrayContains, or } from "drizzle-orm"
import {
  projectsTable,
  createProjectSchema,
  updateProjectSchema,
  selectProjectSchema,
  eventsTable,
} from "@/db/schema"
import { TrpcSync } from "trpc-db-collection/server"
import { drizzleEventsAdapter } from "../events"

type Project = z.infer<typeof selectProjectSchema>
const projectsRouterSync = new TrpcSync<Project>()

export const projectsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const projects = await ctx.db
      .select()
      .from(projectsTable)
      .where(
        or(
          arrayContains(projectsTable.sharedUserIds, [ctx.session.user.id]),
          eq(projectsTable.ownerId, ctx.session.user.id)
        )
      )

    return projects
  }),

  create: authedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only create projects you own",
        })
      }

      const result = await ctx.db.transaction(async (tx) => {
        const [newItem] = await tx
          .insert(projectsTable)
          .values(input)
          .returning()
        return newItem
      })

      const eventId = await projectsRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        event: {
          action: "insert",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Project>(
            ctx.session.user.id,
            "projects",
            ctx.db,
            event
          ),
      })

      return { item: result, eventId: eventId }
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.number(),
        data: updateProjectSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const [updatedItem] = await tx
          .update(projectsTable)
          .set(input.data)
          .where(
            and(
              eq(projectsTable.id, input.id),
              eq(projectsTable.ownerId, ctx.session.user.id)
            )
          )
          .returning()

        if (!updatedItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Project not found or you do not have permission to update it",
          })
        }

        return updatedItem
      })

      const eventId = await projectsRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        otherUserIds: result.sharedUserIds.concat(result.ownerId),
        event: {
          action: "update",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Project>(
            ctx.session.user.id,
            "projects",
            ctx.db,
            event
          ),
      })

      return { item: result, eventId: eventId }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const [deletedItem] = await tx
          .delete(projectsTable)
          .where(
            and(
              eq(projectsTable.id, input.id),
              eq(projectsTable.ownerId, ctx.session.user.id)
            )
          )
          .returning()

        if (!deletedItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Project not found or you do not have permission to delete it",
          })
        }

        return deletedItem
      })

      const eventId = await projectsRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        otherUserIds: result.sharedUserIds.concat(result.ownerId),
        event: {
          action: "delete",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Project>(
            ctx.session.user.id,
            "projects",
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
      yield* projectsRouterSync.eventsSubscription({
        userId: opts.ctx.session.user.id,
        signal: opts.signal,
        lastEventId: opts.input?.lastEventId,
        fetchLastEvents: async (lastEventId) => {
          const events = await opts.ctx.db
            .select()
            .from(eventsTable)
            .where(
              and(
                eq(eventsTable.router, "projects"),
                eq(eventsTable.userId, opts.ctx.session.user.id),
                lastEventId ? gt(eventsTable.id, lastEventId) : undefined
              )
            )

          return events.map((event) => ({
            ...event,
            data: event.data as Project,
          }))
        },
      })
    }),
})
