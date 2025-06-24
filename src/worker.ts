import { documentProcessor } from "./workers/documentProcessor.js";
import { getDatabase, getRedis, closeConnections } from "./config.js";
import { deadLetterService } from "./services/deadLetterService.js";

const startWorker = async () => {
  try {
    console.log("🔧 Starting document processing worker...");

    console.log("🔧 Testing database connection...");
    const db = getDatabase();
    await db.query("SELECT NOW()");
    console.log("✅ Database connected");

    console.log("🔧 Testing Redis connection...");
    const redis = getRedis();
    await redis.ping();
    console.log("✅ Redis connected");

    console.log("🚀 Worker is ready to process documents!");
    console.log("📋 Worker configuration:");
    console.log(`   Queue: document-processing`);

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down worker...`);

      try {
        await documentProcessor.close();
        console.log("✅ Worker stopped");
        await deadLetterService.close();
        console.log("✅ deadLetterService stopped");
        await closeConnections();
        console.log("✅ Connections closed");

        process.exit(0);
      } catch (error) {
        console.error("❌ Error during worker shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("💥 Failed to start worker:", error);
    process.exit(1);
  }
};

startWorker();
