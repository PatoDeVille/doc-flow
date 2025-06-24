import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
} from "../../database/models.js";
import { DocumentStatus, DocumentProcessingJob } from "../../types/document.js";
import { storageService } from "../../services/storageService.js";
import { Queue } from "bullmq";
import { appConfig, getRedis } from "../../config.js";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";

const processingQueue = new Queue("document-processing", {
  connection: getRedis(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});
const getAccountId = (request: FastifyRequest): string =>
  request["auth"]?.accountId || "";
export const uploadRoutes = async (fastify: FastifyInstance) => {
  fastify.addHook("preHandler", requireAuth);

  // CREATE - Upload document
  fastify.post(
    "/documents",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const accountId = getAccountId(request);

      try {
        const data = await request.file();

        if (!data) {
          console.warn(`⚠️ [UPLOAD_NO_FILE] accountId=${accountId}`);
          return reply.status(400).send({ error: "No file uploaded" });
        }

        const allowedTypes = appConfig.allowedFileTypes || [
          "application/pdf",
          "image/jpeg",
          "image/jpg",
          "image/png",
        ];

        if (!allowedTypes.includes(data.mimetype)) {
          console.warn(
            `⚠️ [UPLOAD_INVALID_TYPE] accountId=${accountId} type=${data.mimetype}`
          );
          return reply.status(400).send({
            error: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
          });
        }

        const fileBuffer = await data.toBuffer();
        const fileSize = fileBuffer.length;
        const maxSize = appConfig.maxFileSize; // 10MB

        if (fileSize > maxSize) {
          console.warn(
            `⚠️ [UPLOAD_TOO_LARGE] accountId=${accountId} size=${fileSize}`
          );
          return reply.status(400).send({
            error: `File too large. Max ${Math.round(maxSize / 1024 / 1024)}MB.`,
          });
        }

        const filename = `${uuidv4()}-${data.filename}`;
        const cleanFilename = filename
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9.-]/g, "")
          .toLowerCase();

        console.log(
          `📤 [UPLOAD_START] accountId=${accountId} filename=${data.filename} clean_filename=${cleanFilename} size=${fileSize}`
        );

        const storageKey = await storageService.uploadFile(
          accountId,
          cleanFilename,
          fileBuffer,
          data.mimetype
        );

        const documentId = await createDocument({
          filename: cleanFilename,
          originalName: data.filename || "unknown",
          fileSize,
          mimeType: data.mimetype,
          storageKey,
          status: DocumentStatus.UPLOADED,
        });

        const jobData: DocumentProcessingJob = {
          documentId,
          storageKey,
          filename: cleanFilename,
        };

        const job = await processingQueue.add("process-document", jobData, {
          priority: 1,
          delay: 1000,
        });

        console.log(
          `✅ [UPLOAD_SUCCESS] accountId=${accountId} document_id=${documentId} job_id=${job.id}`
        );

        return reply.status(201).send({
          success: true,
          documentId,
          jobId: job.id,
          message: "Document uploaded and queued for processing",
        });
      } catch (error) {
        console.error(
          `❌ [UPLOAD_FAILED] accountId=${accountId} error=${(error as Error).message}`
        );
        return reply.status(500).send({ error: "Upload failed" });
      }
    }
  );

  // READ - Get document by ID
  fastify.get(
    "/documents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const accountId = getAccountId(request);

      try {
        const { id } = request.params;
        const document = await getDocument(id);

        if (!document) {
          console.warn(
            `⚠️ [GET_DOCUMENT_NOT_FOUND] accountId=${accountId} id=${id}`
          );
          return reply.status(404).send({ error: "Document not found" });
        }

        return reply.send(document);
      } catch (error) {
        console.error(
          `❌ [GET_DOCUMENT_FAILED] accountId=${accountId} error=${(error as Error).message}`
        );
        return reply.status(500).send({ error: "Failed to get document" });
      }
    }
  );

  // UPDATE - Update document
  fastify.put(
    "/documents/:id",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status?: DocumentStatus; errorMessage?: string };
      }>,
      reply: FastifyReply
    ) => {
      const accountId = getAccountId(request);

      try {
        const { id } = request.params;
        const updates = request.body;

        const document = await getDocument(id);
        if (!document) {
          console.warn(
            `⚠️ [UPDATE_DOCUMENT_NOT_FOUND] accountId=${accountId} id=${id}`
          );
          return reply.status(404).send({ error: "Document not found" });
        }

        await updateDocument(id, updates);

        console.log(`✏️ [DOCUMENT_UPDATED] accountId=${accountId} id=${id}`);
        return reply.send({
          success: true,
          message: "Document updated successfully",
        });
      } catch (error) {
        console.error(
          `❌ [UPDATE_DOCUMENT_FAILED] accountId=${accountId} error=${(error as Error).message}`
        );
        return reply.status(500).send({ error: "Failed to update document" });
      }
    }
  );

  // DELETE - Delete document
  fastify.delete(
    "/documents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const accountId = getAccountId(request);

      try {
        const { id } = request.params;
        const document = await getDocument(id);

        if (!document) {
          console.warn(
            `⚠️ [DELETE_DOCUMENT_NOT_FOUND] accountId=${accountId} id=${id}`
          );
          return reply.status(404).send({ error: "Document not found" });
        }

        await deleteDocument(id);

        try {
          await storageService.deleteFile(document.storageKey);
          console.log(
            `✅ [DELETE_STORAGE] accountId=${accountId} document_id=${id} storage_key=${document.storageKey}`
          );
        } catch (storageError) {
          console.warn(
            `⚠️ [DELETE_STORAGE_FAILED] accountId=${accountId} document_id=${id} error=${(storageError as Error).message}`
          );
        }

        return reply.send({
          success: true,
          message: "Document deleted successfully",
        });
      } catch (error) {
        console.error(
          `❌ [DELETE_DOCUMENT_FAILED] accountId=${accountId} error=${(error as Error).message}`
        );
        return reply.status(500).send({ error: "Failed to delete document" });
      }
    }
  );
};
