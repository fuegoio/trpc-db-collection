import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
  text,
  jsonb,
} from "drizzle-orm/pg-core"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"
export * from "./auth-schema"
import { users } from "./auth-schema"

const { createInsertSchema, createSelectSchema, createUpdateSchema } =
  createSchemaFactory({ zodInstance: z })

export const projectsTable = pgTable(`projects`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  description: text(),
  sharedUserIds: text("shared_user_ids").array().notNull().default([]),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
})

export const todosTable = pgTable(`todos`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  text: varchar({ length: 500 }).notNull(),
  completed: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
})

export const eventsTable = pgTable(`events`, {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: text().notNull(),
  router: varchar({ length: 255 }).notNull(),
  action: varchar({ length: 255 })
    .notNull()
    .$type<"insert" | "update" | "delete">(),
  data: jsonb().notNull(),
})

export const selectProjectSchema = createSelectSchema(projectsTable)
export const createProjectSchema = createInsertSchema(projectsTable).omit({
  createdAt: true,
})
export const updateProjectSchema = createUpdateSchema(projectsTable)

export const selectTodoSchema = createSelectSchema(todosTable)
export const createTodoSchema = createInsertSchema(todosTable).omit({
  createdAt: true,
})
export const updateTodoSchema = createUpdateSchema(todosTable)

export type Project = z.infer<typeof selectProjectSchema>
export type UpdateProject = z.infer<typeof updateProjectSchema>
export type Todo = z.infer<typeof selectTodoSchema>
export type UpdateTodo = z.infer<typeof updateTodoSchema>

export const selectUsersSchema = createSelectSchema(users)
