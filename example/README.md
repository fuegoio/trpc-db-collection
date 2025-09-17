This is an example project that uses `trpc-db-collection`. It is a fork of the [Electric-SQL example](https://github.com/electric-sql/electric/tree/main/examples/tanstack-db-web-starter) to showcase what can be achieved with this simple integration.

# Getting Started

## Create a new project

To create a new project based on this starter, run the following commands:

```sh
npx gitpick fuegoio/trpc-db-collection/tree/main/example my-tanstack-db-trpc-project
cd my-tanstack-db-trpc-project
```

Copy the `.env.example` file to `.env`:

```sh
cp .env.example .env
```

_You can edit the values in the `.env` file, although the default values are fine for local development (with the `DATABASE_URL` defaulting to the development Postgres docker container and the `BETTER_AUTH_SECRET` not required)._

## Quick Start

Follow these steps in order for a smooth first-time setup:

1. **Install dependencies:**

   ```sh
   pnpm install
   ```

2. **Start Docker services:**

   ```sh
   pnpm run dev
   ```

   This starts the dev server, Docker Compose (Postgres), and Caddy automatically.

3. **Run database migrations** (in a new terminal):

   ```sh
   pnpm run migrate
   ```

4. **Visit the application:**
   Open [https://tanstack-db-trpc-example.localhost](https://tanstack-db-trpc-example.localhost)

If you run into issues, see the [pre-reqs](#pre-requisites) and [troubleshooting](#common-pitfalls) sections below.

## Adding a New Table

Here's how to add a new table to your app (using a "categories" table as an example):

### 1. Define the Drizzle Schema

Add your table to `src/db/schema.ts`:

```tsx
export const categoriesTable = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  color: varchar({ length: 7 }), // hex color
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

// Add Zod schemas
export const selectCategorySchema = createSelectSchema(categoriesTable)
export const createCategorySchema = createInsertSchema(categoriesTable).omit({
  created_at: true,
})
export const updateCategorySchema = createUpdateSchema(categoriesTable)
```

### 2. Generate & Run Migration

```sh
# Generate migration file
pnpm migrate:generate

# Apply migration to database
pnpm migrate
```

### 3. Add tRPC Router

Create `src/lib/trpc/categories.ts`:

```tsx
import { router, authedProcedure } from "@/lib/trpc"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import {
  categoriesTable,
  createCategorySchema,
  updateCategorySchema,
  selectCategorySchema,
} from "@/db/schema"

type Category = z.infer<typeof selectCategorySchema>
const categoriesRouterSync = new TrpcSync<Category>()

export const categoriesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const projects = await ctx.db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, ctx.session.user.id))

    return projects
  }),

  create: authedProcedure
    .input(createCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const [newItem] = await tx
          .insert(categoriesTable)
          .values({ ...input, user_id: ctx.session.user.id })
          .returning()
        return { item: newItem, txid }
      })

      const eventId = await todoRouterSync.registerEvent({
        currentUserId: ctx.session.user.id,
        event: {
          action: "insert",
          data: result,
        },
        saveEvent: (event) =>
          drizzleEventsAdapter<Category>(
            ctx.session.user.id,
            "categories",
            ctx.db,
            event
          ),
      })

      return result
    }),

  // Add update, delete and following the same pattern...
})
```

### 4. Wire Up tRPC Router

Add to `src/routes/api/trpc/$.ts`:

```tsx
import { categoriesRouter } from "./trpc/categories"

export const appRouter = router({
  // ... existing routers
  categories: categoriesRouter,
})
```

### 5. Add Collection

Add to `src/lib/collections.ts`:

```tsx
export const categoriesCollection = createCollection(
  trpcCollectionOptions({
    trpcRouter: trpc.categories,
  })
)
```

### 6. Use in Routes

Preload in route loaders and use with `useLiveQuery`:

```tsx
// In route loader
export const Route = createFileRoute("/my-route")({
  loader: async () => {
    await Promise.all([categoriesCollection.preload()])
  },
})

// In component
const { data: categories } = useLiveQuery((q) =>
  q.from({ categoriesCollection }).orderBy(/* ... */)
)
```

That's it! Your new table is now fully integrated with tRPC sync, tRPC mutations, and TanStack DB queries.

## Pre-requisites

This project uses [Docker](https://www.docker.com), [Node](https://nodejs.org/en) with [pnpm](https://pnpm.io) and [Caddy](https://caddyserver.com/). You can see compatible versions in the `.tool-versions` file.

### Docker

Make sure you have Docker running. Docker is used to run the Postgres service defined in `docker-compose.yaml`.

### Caddy

#### Why Caddy?

Exactly like Electric SQL's shape subscriptions, each Tanstack DB collection will create a SSE connection benefits significantly from **HTTP/2 multiplexing**. Without HTTP/2, each shape subscription creates a new HTTP/1.1 connection, which browsers limit to 6 concurrent connections per domain. This creates a bottleneck that makes new events appear slowly.

Caddy provides HTTP/2 support with automatic HTTPS, giving you:

- **Faster shape loading** - Multiple shapes load concurrently over a single connection
- **Better development experience** - No connection limits or artificial delays
- **Production-like performance** - Your local dev mirrors production HTTP/2 behavior

The Vite development server runs on HTTP/1.1 only, so Caddy acts as a reverse proxy to upgrade the connection.

#### Setup

Once you've [installed Caddy](https://caddyserver.com/docs/install), install its root certificate using:

```sh
caddy trust
```

This is necessary for HTTP/2 to work [without SSL warnings/errors in the browser](https://caddyserver.com/docs/command-line#caddy-trust).

#### How It Works

- Caddy auto-starts via a Vite plugin when you run `pnpm dev`
- The `Caddyfile` is automatically generated with your project name
- Your app is available at `https://<project-name>.localhost`

#### Troubleshooting Caddy

If Caddy fails to start:

1. **Test Caddy manually:**

   ```sh
   caddy start
   ```

2. **Check certificate trust:**

   ```sh
   caddy trust
   # To remove later: caddy untrust
   ```

3. **Verify Caddyfile was generated:**
   Look for a `Caddyfile` in your project root after running `pnpm dev`

4. **Stop conflicting Caddy instances:**

   ```sh
   caddy stop
   ```

5. **Check for port conflicts:**
   Caddy needs ports 80 and 443 available

## Troubleshooting

### Common Pitfalls

| Issue                    | Symptoms                          | Solution                                                           |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| **Docker not running**   | `docker compose ps` shows nothing | Start Docker Desktop/daemon                                        |
| **Caddy not trusted**    | SSL warnings in browser           | Run `caddy trust` (see Caddy section below)                        |
| **Port conflicts**       | Postgres (54321) in use           | Stop conflicting services or change ports in `docker-compose.yaml` |
| **Missing .env**         | Database connection errors        | Copy `.env.example` to `.env`                                      |
| **Caddy fails to start** | `Caddy exited with code 1`        | Run `caddy start` manually to see the error                        |

### Debugging Commands

For troubleshooting, these commands are helpful:

```sh
# Check Docker services status
docker compose ps

# View Postgres logs
docker compose logs -f postgres

# Test database connectivity
psql $DATABASE_URL -c "SELECT 1"

# Check Caddy status
caddy start
```

## Building For Production

To build this application for production:

```bash
pnpm run build
```

### Production Deployment Checklist

Before deploying to production, ensure you have configured:

#### Required Environment Variables

```bash
# Authentication - REQUIRED in production
BETTER_AUTH_SECRET=your-secret-key-here

# Database (adjust for your production database)
DATABASE_URL=postgresql://user:pass@your-prod-db:5432/dbname
```

#### Authentication Setup

**⚠️ Important**: The current setup allows any email/password combination to work in development. This is **automatically disabled** in production, but you need to:

1. **Configure proper auth providers** in `src/lib/auth.ts` (Google, GitHub, etc.)
2. **Remove or secure the dev-only email/password auth** if you plan to use it
3. **Review `trustedOrigins`** settings for your production domains

#### Infrastructure Changes

- **HTTPS & Secure Cookies**: Ensure your deployment platform handles HTTPS termination
- **Database**: Use a managed PostgreSQL service (not the Docker container)
- **Environment**: Set `NODE_ENV=production`

#### Security Considerations

- Generate a strong `BETTER_AUTH_SECRET` (minimum 32 characters)
- Ensure database credentials are properly secured
- Review CORS settings if serving from different domains
- Verify that dev-mode authentication patterns are disabled

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

## Routing

This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a file based router. Which means that the routes are managed as files in `src/routes`.

## Core Architecture Rules

Follow these patterns to get the most out of this starter:

- **Use collection queries for reads** - `useLiveQuery` with collections, not tRPC queries
- **Use collection operations for writes** - Call `collection.insert()`, not `trpc.create.mutate()` directly
- **Preload collections in route loaders** - Prevents loading flicker and ensures data availability

#### Why These Rules Matter

- **Collection handles reads** - Direct tRPC reads real-time sync and optimistic updates
- **Collection operations are optimistic** - They update the UI immediately while syncing in the background
- **Preloading prevents flicker** - Collections load before components render, ensuring data is available

# Learn More

- [TanStack documentation](https://tanstack.com)
- [TanStack DB documentation](https://tanstack.com/db/latest/docs/overview)
- [An Interactive Guide to TanStack DB](https://frontendatscale.com/blog/tanstack-db)
- [Stop Re-Rendering — TanStack DB, the Embedded Client Database for TanStack Query](https://tanstack.com/blog/tanstack-db-0.1-the-embedded-client-database-for-tanstack-query)
