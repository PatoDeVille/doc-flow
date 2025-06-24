import { Queue, QueueEvents } from "bullmq";
import { getRedis } from "../config.js";
import { updateDocument } from "../database/models.js";
import { DocumentStatus, DocumentProcessingJob } from "../types/document.js";

export class DeadLetterService {
  private queueEvents: QueueEvents;
  private deadLetterQueue: Queue;
  private processingQueue: Queue | null = null; 

  constructor() {
    this.queueEvents = new QueueEvents("document-processing", {
      connection: getRedis(),
    });

    this.deadLetterQueue = new Queue("document-dead-letters", {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    this.setupEventListeners();
    console.log("💀 Dead letter monitoring started with dedicated queue");
  }

  // Inject the main processing queue from index.ts
  setProcessingQueue(queue: Queue): void {
    this.processingQueue = queue;
    console.log("✅ Main processing queue connected to dead letter service");
  }

  private setupEventListeners(): void {
    this.queueEvents.on("failed", async ({ jobId, failedReason, prev }) => {
      try {
        console.log(
          `🔍 [DEAD_LETTER_CHECK] job_id=${jobId} reason=${failedReason}`
        );

        if (!this.processingQueue) {
          console.warn(`⚠️ [DEAD_LETTER] Processing queue not connected yet`);
          return;
        }

        // Get the actual job object to check attempts
        const job = await this.processingQueue.getJob(jobId!);

        if (!job) {
          console.warn(`⚠️ [DEAD_LETTER] Job ${jobId} not found in queue`);
          return;
        }

        const maxAttempts = job.opts.attempts || 3;
        const currentAttempts = job.attemptsMade;

        console.log(
          `📊 [DEAD_LETTER_ATTEMPTS] job_id=${jobId} attempts=${currentAttempts}/${maxAttempts}`
        );

        // Permanently failed (exhausted all retries)
        if (currentAttempts >= maxAttempts) {
          const data = job.data;

          console.error(`💀 [DEAD_LETTER_DETECTED] 
📄 Document ID: ${data.documentId}
📁 Filename: ${data.filename}
❌ Reason: ${failedReason}
🔢 Attempts: ${currentAttempts}/${maxAttempts}
⏰ Time: ${new Date().toISOString()}
🎛️  Main Queue: http://localhost:3001/admin/queues
💀 Dead Letters: Available in Bull Dashboard
🔧 Action: Use Bull Dashboard to retry from dead letter queue
          `);

          await this.addToDeadLetterQueue(data, failedReason, currentAttempts);


          await updateDocument(data.documentId, {
            status: DocumentStatus.FAILED,
            errorMessage: `Dead letter (${currentAttempts} attempts): ${failedReason}`,
          });

          // Alert system integration point
          await this.alertDeadLetter(data, failedReason);
        } else {
          console.log(
            `🔄 [RETRY_PENDING] job_id=${jobId} will retry (${currentAttempts}/${maxAttempts})`
          );
        }
      } catch (error) {
        console.error(
          `❌ [DEAD_LETTER_MONITOR_ERROR] ${(error as Error).message}`
        );
      }
    });

    this.queueEvents.on("waiting", async ({ jobId, prev }) => {
      if (prev === "failed") {
        console.log(`🔄 [JOB_RETRY] job_id=${jobId} attempting retry`);
      }
    });
  }

  private async addToDeadLetterQueue(
    jobData: DocumentProcessingJob,
    reason: string,
    attempts: number
  ): Promise<void> {
    await this.deadLetterQueue.add(
      "dead-letter",
      {
        ...jobData,
        deadLetterReason: reason,
        failedAttempts: attempts,
        deadLetterTimestamp: new Date().toISOString(),
        originalJobId: jobData.documentId, 
      },
      {
        priority: 1, // High priority for manual review
      }
    );

    console.log(
      `💀 [DEAD_LETTER_QUEUED] document_id=${jobData.documentId} moved to dead letter queue`
    );
  }

  private async alertDeadLetter(
    jobData: DocumentProcessingJob,
    reason: string
  ): Promise<void> {
    
    console.error(`
🚨 [DEAD_LETTER_ALERT] 
Document ID: ${jobData.documentId}
Filename: ${jobData.filename}
Reason: ${reason}
Time: ${new Date().toISOString()}
Action Required: Check Bull Dashboard dead letter queue
Main Dashboard: http://localhost:3001/admin/queues
    `);

    // TODO: Real alerting integration points
    // - await this.sendSlackAlert(jobData, reason);
   
  }

  async close(): Promise<void> {
    console.log("🛑 Shutting down dead letter monitor...");
    await this.queueEvents.close();
    console.log("✅ Dead letter monitor stopped");
  }

  // Getter for dead letter queue (for external monitoring dashboard)
  get deadLetters(): Queue {
    return this.deadLetterQueue;
  }
}

// singleton
export const deadLetterService = new DeadLetterService();
