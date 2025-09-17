import {
  createTRPCProxyClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client"
import type { AppRouter } from "@/routes/api/trpc/$"
import superjson from "superjson"

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      // uses the httpSubscriptionLink for subscriptions
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: `/api/trpc`,
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: `/api/trpc`,
        transformer: superjson,
      }),
    }),
  ],
})
