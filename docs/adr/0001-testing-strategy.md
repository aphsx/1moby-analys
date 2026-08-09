# Testing strategy: bun:test units + thin Playwright smoke suite with seeded auth session

The repo had no test framework; the 2026-07 structure refactor (ultracite, api lib feature
folders) needed a safety net. We chose `bun:test` for unit tests of pure functions (sheet
cleaners, excel-core, derived-field mappers) because it ships with the runtime we already use,
and a thin Playwright smoke suite (~5–8 specs: login, runs list, run summary, customers table,
customer 360, model performance) instead of per-feature e2e coverage.

Google OAuth cannot be automated, so Playwright bypasses login by seeding a Better Auth
user + session row directly in the test database and injecting the session cookie — do not
"fix" this by scripting the Google login page.

## Considered options

- Full per-feature Playwright coverage — rejected: delays the refactor and ai-chat/training
  specs would require live ML + Ollama.
- Deferring e2e until after the refactor — rejected: each refactor phase must prove the
  features still work, not just typecheck.
