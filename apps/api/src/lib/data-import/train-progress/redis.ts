import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);

let _client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_client || _client.status === "end") {
    // ponytail: REDIS_URL wins when set (managed Redis needs auth); host/port
    // stays the docker-compose path.
    const options = { lazyConnect: false, maxRetriesPerRequest: 1 };
    _client = REDIS_URL
      ? new IORedis(REDIS_URL, options)
      : new IORedis(REDIS_PORT, REDIS_HOST, options);
  }
  return _client;
}
