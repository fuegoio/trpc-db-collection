import { router, authedProcedure } from "@/lib/trpc"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { users, type selectUsersSchema } from "@/db/schema"
import { TrpcSync } from "trpc-db-collection/server"

const usersRouterSync = new TrpcSync<z.infer<typeof selectUsersSchema>>()

export const usersRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return await ctx.db.select({ id: users.id, name: users.name }).from(users)
  }),

  create: authedProcedure.input(z.any()).mutation(async () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Can't create new users through API",
    })
  }),

  update: authedProcedure
    .input(z.object({ id: z.string(), data: z.any() }))
    .mutation(async () => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Can't edit users through API",
      })
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async () => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Can't delete users through API",
      })
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
      yield* usersRouterSync.eventsSubscription({
        userId: opts.ctx.session.user.id,
        signal: opts.signal,
        lastEventId: opts.input?.lastEventId,
        fetchLastEvents: async () => {
          return []
        },
      })
    }),
})
