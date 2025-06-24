import { hasOpenAI, openAIConfig } from "../config";
import {
  OCRResult,
  InvoiceMetadata,
  InvoiceMetadataSchema,
} from "../types/document";
import { ChatOpenAI } from "@langchain/openai";


export const checkForFailureTriggers = (filename: string): void => {
  
  if (filename.includes("fail-ocr")) {
    throw new Error("OCR service unavailable - testing failure");
  }

  if (filename.includes("fail-storage")) {
    throw new Error("Storage service timeout - testing retry logic");
  }

  if (filename.includes("fail-extraction")) {
    throw new Error("Metadata extraction failed - testing dead letters");
  }

  if (filename.includes("fail-random")) {
    if (Math.random() < 0.8) {
      // 80% failure rate
      throw new Error(
        "Random failure for testing - simulating unstable service"
      );
    }
  }
};

export const simulateOCR = async (
  imageBuffer: Buffer,
  filename?: string
): Promise<OCRResult> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // TESTING: Check filename for failure triggers
      if (filename && process.env.ENABLE_TEST_FAILURES === "true") {
        try {
          checkForFailureTriggers(filename);
        } catch (error) {
          console.log(`🧪 [TEST_FAILURE] ${(error as Error).message}`);
          reject(error);
          return;
        }

        // Random 30% failure rate for testing
        if (Math.random() < 0.3) {
          console.log("🧪 [TEST_FAILURE] Simulating random OCR failure");
          reject(new Error("Simulated OCR timeout - testing dead letters"));
          return;
        }
      }

      resolve({
        text: "INVOICE\nCompany: Acme Corp\nEmail: billing@acme.com\nInvoice #: INV-2024-001\nDate: 2024-06-23\nAmount: $1,250.00\nCurrency: USD\nThank you for your business!",
        confidence: 87,
      });
    }, 500);
  });
};

const extractWithAI = async (ocrText: string): Promise<InvoiceMetadata> => {
  if (!hasOpenAI()) {
    throw new Error("OpenAI API key not configured");
  }

  const model = new ChatOpenAI({
    openAIApiKey: openAIConfig.apiKey,
    modelName: openAIConfig.model,
    temperature: openAIConfig.temperature,
  }).withStructuredOutput(InvoiceMetadataSchema);

  const result = await model.invoke(`Extract invoice data from: ${ocrText}`);
  console.log(
    `✅ [LANGCHAIN_EXTRACT] customer=${result.customerName} amount=${result.totalAmount}`
  );

  return result;
};

const extractWithRegex = (ocrText: string): InvoiceMetadata => {
  const customerName = ocrText.match(/Company:\s*(.+)/i)?.[1]?.trim() || null;
  const customerEmail =
    ocrText.match(/Email:\s*([^\s]+)/i)?.[1]?.trim() || null;
  const invoiceNumber =
    ocrText.match(/Invoice\s*#\s*:\s*([A-Z0-9-]+)/i)?.[1]?.trim() || null;
  const invoiceDate =
    ocrText.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || null;
  const totalAmount = ocrText.match(/Amount:\s*\$?([\d,]+\.?\d*)/i)?.[1];
  const currency = ocrText.match(/Currency:\s*([A-Z]{3})/i)?.[1] || null;

  const extractedFields = [
    customerName,
    customerEmail,
    invoiceNumber,
    invoiceDate,
    totalAmount,
    currency,
  ].filter((field) => field !== null);

  const totalFields = 6;
  const extractionConfidence = Math.round(
    (extractedFields.length / totalFields) * 100
  );

  return {
    customerName,
    customerEmail,
    invoiceNumber,
    invoiceDate,
    totalAmount: totalAmount ? parseFloat(totalAmount.replace(/,/g, "")) : null,
    currency,
    extractionConfidence,
  };
};

export const extractInvoiceMetadata = async (
  ocrResult: OCRResult
): Promise<InvoiceMetadata> => {
  try {
    if (hasOpenAI()) {
      console.log(`🤖 [EXTRACT_MODE] Using OpenAI extraction`);
      return await extractWithAI(ocrResult.text);
    } else {
      console.log(`🔍 [EXTRACT_MODE] Using regex extraction (no OpenAI key)`);
      return extractWithRegex(ocrResult.text);
    }
  } catch (error) {
    console.error(
      `❌ [EXTRACT_FAILED] ${(error as Error).message}, falling back to regex`
    );
    return extractWithRegex(ocrResult.text);
  }
};

export const processDocument = async (
  fileBuffer: Buffer,
  filename?: string
) => {
  // TESTING: Check for late-stage failures
  if (
    filename &&
    process.env.ENABLE_TEST_FAILURES === "true" &&
    filename.includes("fail-late")
  ) {
    throw new Error("Late-stage processing failure - testing final retry");
  }

  const ocrResult = await simulateOCR(fileBuffer, filename);
  const metadata = await extractInvoiceMetadata(ocrResult);
  const isValid = metadata.extractionConfidence > 50;

  return { ocrResult, metadata, isValid };
};
