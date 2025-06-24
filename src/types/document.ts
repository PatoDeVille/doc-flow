import { z } from 'zod';

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing', 
  PROCESSED = 'processed',
  VALIDATED = 'validated',
  FAILED = 'failed',
  COMPLETED = 'completed'
}

//ONLY this needs Zod (for LangChain structured output)
export const InvoiceMetadataSchema = z.object({
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().nullable(),
  extractionConfidence: z.number().min(0).max(100)
});
export type InvoiceMetadata = z.infer<typeof InvoiceMetadataSchema>;

export interface OCRResult {
  text: string;
  confidence: number;
}

export interface CreateDocumentInput {
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  status: DocumentStatus;
}

export interface ProcessedDocument {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  status: DocumentStatus;
  uploadedAt: Date;
  processedAt: Date | null;
  ocrResult: OCRResult | null;
  extractedMetadata: InvoiceMetadata | null;
  errorMessage: string | null;
  retryCount: number;
  processingTimeMs: number | null;
}

export interface DocumentProcessingJob {
  documentId: string;
  storageKey: string;
  filename: string;
}

