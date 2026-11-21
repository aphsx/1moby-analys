---
status: accepted
---

# Schema changes ship as numbered plain-SQL migrations

`db/init/001_schema.sql` only runs on an empty Postgres volume, so once production holds data it can no
longer change the schema; the boot-time `ALTER TABLE` patches in `apps/api/src/lib/schema-compat.ts` were
an undeclared workaround for that. We keep `001_schema.sql` as the baseline and add every later change as
`db/migrations/NNN_name.sql`, applied in order by a small runner that records each file in a
`schema_migrations` table. Drizzle stays in introspect mode and is re-introspected after each migration.

## Considered Options

- **drizzle-kit generate / migrate**: rejected. The SQL file owns the schema and Drizzle only reflects it;
  generating migrations from `schema.ts` would flip ownership and fight the hand-written SQL.
- **Alembic**: rejected. The ML service would own a schema that the TypeScript API mostly writes.
- **Keep editing `001_schema.sql` in place**: rejected. It cannot reach a database that already has data.
