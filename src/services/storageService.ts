import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getS3Client, bucketName } from "../config";

export class StorageService {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = getS3Client();
    this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      console.log(`✅ [STORAGE_BUCKET_EXISTS] bucket=${bucketName}`);
    } catch (error) {
      console.log(`🔧 [STORAGE_CREATING_BUCKET] bucket=${bucketName}`);
      try {
        await this.s3Client.send(
          new CreateBucketCommand({ Bucket: bucketName })
        );
        console.log(`✅ [STORAGE_BUCKET_CREATED] bucket=${bucketName}`);
      } catch (createError) {
        console.error(
          `❌ [STORAGE_BUCKET_FAILED] bucket=${bucketName} error=${(createError as Error).message}`
        );
      }
    }
  }

  async uploadFile(
    clientId: string,
    filename: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    const storageKey = this.generateStorageKey(clientId, filename);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: contentType,
      Metadata: {
        clientId,
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      console.log(
        `✅ [STORAGE_UPLOAD] key=${storageKey} size=${fileBuffer.length} client=${clientId}`
      );
      return storageKey;
    } catch (error) {
      console.error(
        `❌ [STORAGE_UPLOAD_FAILED] key=${storageKey} error=${(error as Error).message}`
      );
      throw new Error(`Failed to upload file: ${(error as Error).message}`);
    }
  }

  async downloadFile(storageKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    });

    try {
      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error("No file content received");
      }

      const buffer = Buffer.from(await response.Body.transformToByteArray());

      console.log(
        `✅ [STORAGE_DOWNLOAD] key=${storageKey} size=${buffer.length}`
      );
      return buffer;
    } catch (error) {
      console.error(
        `❌ [STORAGE_DOWNLOAD_FAILED] key=${storageKey} error=${(error as Error).message}`
      );
      throw new Error(`Failed to download file: ${(error as Error).message}`);
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    });

    try {
      await this.s3Client.send(command);
      console.log(`✅ [STORAGE_DELETE] key=${storageKey}`);
    } catch (error) {
      console.error(
        `❌ [STORAGE_DELETE_FAILED] key=${storageKey} error=${(error as Error).message}`
      );
      throw new Error(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  private generateStorageKey(clientId: string, filename: string): string {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `${clientId}/${date}/${filename}`;
  }
}

// Export singleton instance
export const storageService = new StorageService();
