// Environment variables are loaded in app.js before this module is imported

// Redis configuration (optional)
export const redisConfig = {
  enabled: process.env.REDIS_ENABLED === 'true',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
};

let redisClient = null;

export async function initRedis() {
  if (!redisConfig.enabled) {
    console.log('ℹ️  Redis is disabled, using in-memory cache');
    return null;
  }

  try {
    const redis = await import('redis');
    redisClient = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis error:', err);
    });

    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('ℹ️  Falling back to in-memory cache');
    return null;
  }
}

export function getRedisClient() {
  return redisClient;
}

export default redisConfig;
