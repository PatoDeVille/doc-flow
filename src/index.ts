import { createServer } from "./api/server.js";
import { uploadRoutes } from "./api/routes/upload.js";
import {
  appConfig,
  getDatabase,
  getRedis,
  closeConnections,
  s3Config,
} from "./config.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { FastifyAdapter } from "@bull-board/fastify";
import { Queue } from "bullmq";
import { deadLetterService } from "./services/deadLetterService.js";
import { initializeDatabase } from "./database/init.js";



const startServer = async () => {
  try {
    const fastify = createServer();

    // Test database connection
    console.log("🔧 Testing database connection...");
    const db = getDatabase();
    await db.query("SELECT NOW()");
    console.log("✅ Database connected");

    // Initialize database schema
    await initializeDatabase();

    // Test Redis connection
    console.log("🔧 Testing Redis connection...");
    const redis = getRedis();
    await redis.ping();
    console.log("✅ Redis connected");

    // Setup Bull Dashboard 
    const serverAdapter = new FastifyAdapter();

    // Create main processing queue (single instance)
    const processingQueue = new Queue("document-processing", {
      connection: redis,
    });

    // Inject the queue instance to dead letter service 
    deadLetterService.setProcessingQueue(processingQueue);

    createBullBoard({
        //@ts-ignore (version mismatch quick fix)
        queues: [new BullMQAdapter(processingQueue),new BullMQAdapter(deadLetterService.deadLetters)],
      serverAdapter,
    });

    serverAdapter.setBasePath("/admin/queues");
    //@ts-ignore (version mismatch quick fix)
    await fastify.register(serverAdapter.registerPlugin(), {
      prefix: "/admin/queues",
    });

    
    await fastify.register(uploadRoutes);

    //  Start server
    const address = await fastify.listen({
      port: appConfig.port,
      host: appConfig.host,
    });

    console.log(`🚀 Server running at ${address}`);

    console.log(`\n🎛️  Monitoring:`);
    console.log(`🐂 Bull Dashboard: ${address}/admin/queues`);
    console.log(
      `MinIO Console: http://${s3Config.endpoint || "localhost"}:9011 (minioadmin/minioadmin)`
    );

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

      try {
        await fastify.close();
        console.log("✅ Fastify server closed");

        await deadLetterService.close();
        console.log("✅ Dead letter service closed");

        await closeConnections();
        console.log("✅ Database connections closed");

        process.exit(0);
      } catch (error) {
        console.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("💥 Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
