import { config } from "dotenv";
import Redis from "ioredis";
import { Client as PgClient } from "pg";
import { S3Client } from "@aws-sdk/client-s3";


config();


export const appConfig = {
  host:process.env.HOST || "0.0.0.0",
  port: parseInt(process.env.PORT || "3001"),
  nodeEnv: process.env.NODE_ENV || "development",
  // Processing limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "0") || 10 * 1024 * 1024, // 10MB
  allowedFileTypes: (
    process.env.ALLOWED_FILE_TYPES || "application/pdf,image/jpeg,image/jpg,image/png"
  ).split(","),
  ocrTimeout: parseInt(process.env.OCR_TIMEOUT || "30000"),
  retryAttempts: parseInt(process.env.PROCESSING_RETRY_ATTEMPTS || "3"),
  retryDelay: parseInt(process.env.PROCESSING_RETRY_DELAY || "5000"),
} as const;

export const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6370"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // 🎯 Required by BullMQ!
  retryDelayOnFailover: 100,
} as const;


export const pgConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5440"),
  database: process.env.POSTGRES_DB || "docprocessor",
  user: process.env.POSTGRES_USER || "admin",
  password: process.env.POSTGRES_PASSWORD || "password",
} as const;

// MinIO/S3 configuration
export const s3Config = {
  endpoint: `http://${process.env.MINIO_ENDPOINT || "localhost"}:${process.env.MINIO_PORT || "9010"}`,
  region: "eu-central-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  },
  forcePathStyle: true,
} as const;

export const bucketName = process.env.MINIO_BUCKET || "documents";

export const openAIConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0, // Deterministic for data extraction
} as const;

// Helper to check if OpenAI is available
export const hasOpenAI = (): boolean => {
  return !!openAIConfig.apiKey;
};


let redisInstance: Redis | null = null;
let pgInstance: PgClient | null = null;
let s3Instance: S3Client | null = null;

//  Get Redis connection (singleton)
export const getRedis = (): Redis => {
  if (!redisInstance) {
    redisInstance = new Redis(redisConfig);

    redisInstance.on("connect", () => {
      console.log("✅ Redis connected successfully");
    });

    redisInstance.on("error", (err) => {
      console.error("❌ Redis connection error:", err);
    });
  }

  return redisInstance;
};

// Get PostgreSQL connection (singleton)
export const getDatabase = (): PgClient => {
  if (!pgInstance) {
    pgInstance = new PgClient(pgConfig);

    //  Connect immediately and handle connection events
    pgInstance
      .connect()
      .then(() => {
        console.log("✅ PostgreSQL connected successfully");
      })
      .catch((err) => {
        console.error("❌ PostgreSQL connection error:", err);
      });
  }

  return pgInstance;
};

// Get S3 client (singleton)
export const getS3Client = (): S3Client => {
  if (!s3Instance) {
    s3Instance = new S3Client(s3Config);
    console.log("✅ S3 client initialized");
  }

  return s3Instance;
};

// Graceful shutdown helper
export const closeConnections = async (): Promise<void> => {
  const promises: Promise<any>[] = [];

  if (redisInstance) {
    promises.push(
      redisInstance.quit().then(() => console.log("🔴 Redis disconnected"))
    );
  }

  if (pgInstance) {
    promises.push(
      pgInstance.end().then(() => console.log("🔴 PostgreSQL disconnected"))
    );
  }

  if (s3Instance) {
    s3Instance.destroy();
    console.log("🔴 S3 client destroyed");
  }

  await Promise.all(promises);
};
