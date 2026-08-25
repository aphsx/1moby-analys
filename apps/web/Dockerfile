FROM oven/bun:1-alpine

WORKDIR /app

# Workspace install (layer cache)
COPY package.json bun.lock ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN bun install --frozen-lockfile

COPY packages/types ./packages/types
COPY apps/web ./apps/web

WORKDIR /app/apps/web

# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must be
# present here — not just at runtime. Railway exposes service variables to the build.
ARG NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL}
RUN bun run build

EXPOSE 3000
# ponytail: -H :: for Railway's IPv6-only private network; $PORT is Railway-injected.
CMD ["sh", "-c", "bunx next start -H :: -p ${PORT:-3000}"]
