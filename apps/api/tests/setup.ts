// Pure-function unit tests import modules that read DATABASE_URL at module load
// (e.g. db/client.ts) but never actually query the DB. Provide a dummy value so
// those imports don't throw when DATABASE_URL isn't set in the test environment.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
