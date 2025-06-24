import { getDatabase } from "../config";
import {
  CreateDocumentInput,
  DocumentStatus,
  ProcessedDocument,
} from "../types/document";

const safeQuery = async (query: string, params: any[] = []) => {
  const db = getDatabase();
  return db.query(query, params);
};

export const createDocument = async (
  input: CreateDocumentInput
): Promise<string> => {
  const insertQuery = `
    INSERT INTO documents (filename, original_name, file_size, mime_type, storage_key, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;

  try {
    const result = await safeQuery(insertQuery, [
      input.filename,
      input.originalName,
      input.fileSize,
      input.mimeType,
      input.storageKey,
      input.status,
    ]);

    const documentId = result.rows[0].id;
    console.log(
      `✅ [CREATE_DOC] id=${documentId} filename=${input.filename} client=${input.storageKey.split("/")[0]}`
    );

    return documentId;
  } catch (error) {
    console.error(
      `❌ [CREATE_DOC_FAILED] filename=${input.filename} error=${(error as Error).message}`
    );
    throw error;
  }
};

export const getDocument = async (
  id: string
): Promise<ProcessedDocument | null> => {
  const selectQuery = "SELECT * FROM documents WHERE id = $1";

  try {
    const result = await safeQuery(selectQuery, [id]);

    if (result.rows.length === 0) {
      console.log(`🔍 [GET_DOC_NOT_FOUND] id=${id}`);
      return null;
    }

    const row = result.rows[0];
    console.log(`✅ [GET_DOC] id=${id} status=${row.status}`);

    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      fileSize: parseInt(row.file_size),
      mimeType: row.mime_type,
      storageKey: row.storage_key,
      status: row.status as DocumentStatus,
      uploadedAt: row.uploaded_at,
      processedAt: row.processed_at,
      ocrResult: row.ocr_result,
      extractedMetadata: row.extracted_metadata,
      errorMessage: row.error_message,
      retryCount: row.retry_count || 0,
      processingTimeMs: row.processing_time_ms,
    };
  } catch (error) {
    console.error(
      `❌ [GET_DOC_FAILED] id=${id} error=${(error as Error).message}`
    );
    throw error;
  }
};

export const updateDocument = async (
  id: string,
  updates: Partial<ProcessedDocument>
): Promise<void> => {
  try {
    if (updates.status) {
      await safeQuery(
        "UPDATE documents SET status = $1, updated_at = NOW() WHERE id = $2",
        [updates.status, id]
      );
      console.log(`✅ [UPDATE_DOC_STATUS] id=${id} status=${updates.status}`);
    }

    if (updates.processedAt) {
      await safeQuery(
        "UPDATE documents SET processed_at = $1, updated_at = NOW() WHERE id = $2",
        [updates.processedAt, id]
      );
      console.log(`✅ [UPDATE_DOC_PROCESSED_AT] id=${id}`);
    }

    if (updates.ocrResult) {
      await safeQuery(
        "UPDATE documents SET ocr_result = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(updates.ocrResult), id]
      );
      console.log(
        `✅ [UPDATE_DOC_OCR] id=${id} confidence=${updates.ocrResult.confidence}`
      );
    }

    if (updates.extractedMetadata) {
      await safeQuery(
        "UPDATE documents SET extracted_metadata = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(updates.extractedMetadata), id]
      );
      console.log(`✅ [UPDATE_DOC_METADATA] id=${id}`);
    }

    if (updates.processingTimeMs !== undefined) {
      await safeQuery(
        "UPDATE documents SET processing_time_ms = $1, updated_at = NOW() WHERE id = $2",
        [updates.processingTimeMs, id]
      );
      console.log(
        `✅ [UPDATE_DOC_TIMING] id=${id} duration=${updates.processingTimeMs}ms`
      );
    }

    if (updates.errorMessage) {
      await safeQuery(
        "UPDATE documents SET error_message = $1, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $2",
        [updates.errorMessage, id]
      );
      console.log(
        `❌ [UPDATE_DOC_ERROR] id=${id} error=${updates.errorMessage}`
      );
    }
  } catch (error) {
    console.error(
      `❌ [UPDATE_DOC_FAILED] id=${id} error=${(error as Error).message}`
    );
    throw error;
  }
};


export const deleteDocument = async (id: string): Promise<string | null> => {
  const deleteQuery = `DELETE FROM documents WHERE id = $1 RETURNING id`;
  try {
    const result = await safeQuery(deleteQuery, [id]);

    if (result.rows.length === 0) {
      console.log(`🔍 [DELETE_DOC_NOT_FOUND] id=${id}`);
      return null;
    }

    const deletedId = result.rows[0].id;
    console.log(`💣 [DELETE_DOC] id=${deletedId} success ✅`);

    return deletedId;
  } catch (error) {
    console.error(
      `❌ [DELETE_DOC_FAILED] id=${id} error=${(error as Error).message}`
    );
    throw error;
  }
};
