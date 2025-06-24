import { Worker, Job } from "bullmq";
import { getRedis } from "../config.js";
import { DocumentProcessingJob, DocumentStatus } from "../types/document.js";
import { getDocument, updateDocument } from "../database/models.js";
import { storageService } from "../services/storageService.js";
import {
  checkForFailureTriggers,
  processDocument,
} from "../services/ocrService.js";
import { deadLetterService } from "../services/deadLetterService.js";

export class DocumentProcessor {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      "document-processing",
      this.processJob.bind(this),
      {
        connection: getRedis(),
        concurrency: 3,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );

    this.worker.on("completed", (job) => {
      console.log(
        `✅ [WORKER_COMPLETED] job_id=${job.id} document_id=${job.data.documentId}`
      );
    });

    this.worker.on("failed", (job, err) => {
      console.error(
        `❌ [WORKER_FAILED] job_id=${job?.id} error=${err.message}`
      );
    });

    this.worker.on("error", (err) => {
      console.error(`💥 [WORKER_ERROR] error=${err.message}`);
    });

    console.log("🔄 Document processing worker started");
  }

  // Main job processing logic
  private async processJob(job: Job<DocumentProcessingJob>): Promise<void> {
    const { documentId, storageKey, filename } = job.data;
    const startTime = Date.now();

    try {
      console.log(
        `🔄 [WORKER_START] job_id=${job.id} document_id=${documentId} filename=${filename}`
      );

      // TESTING: Check for failure triggers in filename
      if (process.env.ENABLE_TEST_FAILURES === "true") {
        checkForFailureTriggers(filename);
      }


      await updateDocument(documentId, { status: DocumentStatus.PROCESSING });

      console.log(
        `📥 [WORKER_DOWNLOAD] document_id=${documentId} storage_key=${storageKey}`
      );
      const fileBuffer = await storageService.downloadFile(storageKey);

      // Process document (OCR + extraction) - pass filename for testing
      console.log(
        `🔍 [WORKER_PROCESS] document_id=${documentId} size=${fileBuffer.length}`
      );
      const result = await processDocument(fileBuffer, filename);

      // Update document with results
      await updateDocument(documentId, {
        status: result.isValid
          ? DocumentStatus.VALIDATED
          : DocumentStatus.PROCESSED,
        ocrResult: result.ocrResult,
        extractedMetadata: result.metadata,
        processingTimeMs: Date.now() - startTime,
      });

      if (result.isValid) {
        await updateDocument(documentId, {
          status: DocumentStatus.COMPLETED,
          processedAt: new Date(),
        });
        console.log(
          `✅ [WORKER_SUCCESS] document_id=${documentId} status=completed confidence=${result.metadata.extractionConfidence}`
        );
      } else {
        await updateDocument(documentId, {
          processedAt: new Date(),
        });
        console.log(
          `⚠️ [WORKER_PARTIAL] document_id=${documentId} status=processed confidence=${result.metadata.extractionConfidence}`
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ [WORKER_ERROR] document_id=${documentId} duration=${duration}ms error=${(error as Error).message} attempt=${job.attemptsMade + 1}`
      );

      // Update document with error
      await updateDocument(documentId, {
        status: DocumentStatus.FAILED,
        errorMessage: `Attempt ${job.attemptsMade + 1}: ${(error as Error).message}`,
        processingTimeMs: duration,
      });

      throw error; 
    }
  }

  async close(): Promise<void> {
    console.log("🛑 Shutting down document processor...");
    await this.worker.close();
    console.log("✅ Document processor stopped");
  }
}

// Export singleton
export const documentProcessor = new DocumentProcessor();
