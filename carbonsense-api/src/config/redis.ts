import Redis from "ioredis";
import { env } from "./env";

function shouldDisableRedisInDev(redisUrl: string): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  try {
    const parsed = new URL(redisUrl);
    return parsed.hostname === "host";
  } catch {
    return true;
  }
}

export const redisEnabled = !shouldDisableRedisInDev(env.REDIS_URL);

export const redis = redisEnabled
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true
    })
  : null;

if (redis) {
  redis.on("error", (error) => {
    console.error("Redis connection error", {
      message: error.message
    });
  });
}
