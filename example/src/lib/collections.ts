import { createCollection } from "@tanstack/react-db"
import { trpc } from "@/lib/trpc-client"
import { trpcCollectionOptions } from "trpc-db-collection"

export const usersCollection = createCollection(
  trpcCollectionOptions({
    trpcRouter: trpc.users,
  })
)

export const projectCollection = createCollection(
  trpcCollectionOptions({
    trpcRouter: trpc.projects,
  })
)

export const todoCollection = createCollection(
  trpcCollectionOptions({
    trpcRouter: trpc.todos,
  })
)
