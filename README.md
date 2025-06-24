# doc-flow

A multi-stage document processing pipeline that automatically processes, extracts, validates, and persists information from documents (invoices in this demo) using OCR simulation and metadata extraction.

## Architecture Overview

This system uses an **asynchronous processing pipeline** to handle document uploads without blocking users:

```
User Upload → API Server → File Storage → Background Queue → Worker Process → Database
                ↓                            ↓
           Immediate Response          OCR + Extraction
```

**Key Components:**
- **API Server**: Handles uploads, returns immediately 
- **Redis Queue**: Manages background jobs with retry logic
- **Worker Process**: Processes documents independently 
- **Dead Letter Queue**: Captures permanently failed jobs for manual review

## Design Decisions

### Why Async Processing?
- **User Experience**: File uploads return instantly (no 30-second waits)
- **Reliability**: OCR failures don't crash the upload API
- **Scalability**: Can add more workers as volume grows

### Why Separate Worker Process?
- **Resource Isolation**: Heavy OCR processing doesn't affect API response times
- **Independent Scaling**: Can run workers on different machines
- **Fault Tolerance**: API stays online even if workers crash

### Why Dead Letter Queue?
- **Zero Job Loss**: Failed jobs are preserved, not deleted
- **Manual Recovery**: Operations team can retry failed jobs through dashboard
- **Debugging**: Full context preserved for troubleshooting systematic failures

### Why This Tech Stack?
- **Fastify**: High performance, built-in TypeScript support, not as overkill as NestJS (for this purpose)
- **BullMQ**: Reliable job processing with built-in retry logic and monitoring, super easy to use and junior friendly
- **PostgreSQL**: JSONB support for flexible metadata storage (optimized for querying if needed)
- **MinIO**: S3-compatible storage that works locally and in production
- **LangChain** - AI framework for easier/better information extraction that is not tied to a single vendor
- **Bull Board** - Queue monitoring dashboard, amazing Dx (Developer experience)

## API Endpoints

### **Authentication**
All endpoints require Bearer token authentication:
```bash
Authorization: Bearer <any-token>
```
*For this demo: any Bearer token will work*

### **Document Management**

#### **Upload Document**
```http
POST /documents
Content-Type: multipart/form-data
```

**Request:**
- **Body**: Form data with file upload
- **Supported formats**: PDF, JPEG, PNG
- **Max size**: 10MB

**Response:**
```json
{
  "success": true,
  "documentId": "uuid-here",
  "jobId": "job-123",
  "message": "Document uploaded and queued for processing"
}
```

#### **Get Document**
```http
GET /documents/:id
```

**Response:**
```json
{
  "id": "uuid-here",
  "filename": "invoice-001.pdf",
  "originalName": "Invoice January 2024.pdf",
  "fileSize": 245760,
  "mimeType": "application/pdf",
  "status": "completed",
  "uploadedAt": "2024-06-23T10:30:00Z",
  "processedAt": "2024-06-23T10:30:05Z",
  "ocrResult": {
    "text": "INVOICE\nCompany: Acme Corp...",
    "confidence": 87
  },
  "extractedMetadata": {
    "customerName": "Acme Corp",
    "customerEmail": "billing@acme.com",
    "invoiceNumber": "INV-2024-001",
    "invoiceDate": "2024-06-23",
    "totalAmount": 1250.00,
    "currency": "USD",
    "extractionConfidence": 95
  },
  "processingTimeMs": 2340
}
```

#### **Update Document**
```http
PUT /documents/:id
Content-Type: application/json
```

**Request:**
```json
{
  "status": "processed",
  "errorMessage": "Optional error description"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Document updated successfully"
}
```

#### **Delete Document**
```http
DELETE /documents/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```
## 📊 Document Status Lifecycle

```
uploaded → processing → processed/validated → completed
     ↓
   failed (with retry logic)
```

**Status Definitions:**
- **`uploaded`** - Document received and stored
- **`processing`** - OCR and extraction in progress
- **`processed`** - Basic processing complete (low confidence)
- **`validated`** - High-confidence extraction (>50%)
- **`completed`** - Final status for validated documents
- **`failed`** - Processing failed after retries

## 🔧 Development Tools

### **Monitoring Dashboard**
- **URL**: `http://localhost:3001/admin/queues`
- **Features**: Job status, retry counts, failure analysis
- **Queue**: `document-processing`

### **MinIO Console**
- **URL**: `http://localhost:9011`
- **Credentials**: `minioadmin / minioadmin`
- **Features**: File browser, bucket management, storage analytics

### **Database Access**
- **Host**: `localhost:5440`
- **Database**: `docprocessor`
- **Credentials**: `admin / password`

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+
- Docker & Docker Compose

### **Installation**
```bash
# Clone repository
git clone <your-repo-url>
cd doc-flow

# Install dependencies
npm install

# Start infrastructure
docker-compose up -d

# Copy environment config
cp .env.example .env

# Build project
npm run build
```

### **Running the Application**
```bash
# Terminal 1: Start API server
npm run dev

# Terminal 2: Start worker process
npm run worker
```

### **Testing the API**
```bash
# Upload a document
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@sample-invoice.pdf" \
  http://localhost:3001/documents

# Check document status
curl -H "Authorization: Bearer test-token" \
  http://localhost:3001/documents/{document-id}
```


## 🧪 How to Test Dead Letters:
1. Enable Test Mode:
```bash
# Add to your .env file
ENABLE_TEST_FAILURES=true
```

2. Upload Files with Trigger Names:
Specific Failure Types:
```bash
# OCR failure (immediate)
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@invoice-fail-ocr.pdf" \
  http://localhost:3001/documents
```
# Storage failure (during download)  
```
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@receipt-fail-storage.pdf" \
  http://localhost:3001/documents
```

# Extraction failure (late stage)
```bash
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@contract-fail-extraction.pdf" \
  http://localhost:3001/documents
  ```

# Random failure (80% chance)
```bash
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@document-fail-random.pdf" \
  http://localhost:3001/documents
  ```

# Late-stage failure (after OCR)
```bash
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@invoice-fail-late.pdf" \
  http://localhost:3001/documents
  ```
3. Random Failure Mode:
```bash
# 30% of all uploads will fail randomly
curl -X POST \
  -H "Authorization: Bearer test-token" \
  -F "file=@normal-invoice.pdf" \
  http://localhost:3001/documents
  ```
### Testing Workflow:

- Upload a fail-* file → Job will fail
- BullMQ retries 3 times → Each retry fails
- Dead letter detected → Console shows alert
- Check Bull Dashboard → See failed job in UI
- Click "Retry" in dashboard → Job processes again
- Document status updates → From failed back to completed


---
**Built with ❤️**