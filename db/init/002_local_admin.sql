-- Local credential admin for Docker / fresh volumes.
-- Login: admin (or admin@example.com) / 123
-- Password hash = Better Auth scrypt for "123".
-- API also upserts this user on every boot via seedLocalAdmin() when
-- SEED_LOCAL_ADMIN is enabled (default outside production).

INSERT INTO public."user" (
  id, name, email, "emailVerified", role, "createdAt", "updatedAt"
) VALUES (
  'local-admin',
  'Admin',
  'admin@example.com',
  true,
  'admin',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  name = 'Admin',
  "emailVerified" = true,
  "updatedAt" = NOW();

INSERT INTO public.account (
  id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt"
)
SELECT
  'local-admin-credential',
  u.id,
  'admin@example.com',
  'credential',
  '0e5f3610bbebd1135ccf372c18231953:d7f59fc2ef305171ad0b39a84bb92e57f9f6a020d8225d2f5fc6f3f84890cce88d17efa6a07dbb6b3566b641f01a4cb51644328d4999c2432d07faaa1a5bb109',
  NOW(),
  NOW()
FROM public."user" u
WHERE u.email = 'admin@example.com'
ON CONFLICT (id) DO UPDATE SET
  password = EXCLUDED.password,
  "userId" = EXCLUDED."userId",
  "accountId" = EXCLUDED."accountId",
  "updatedAt" = NOW();
