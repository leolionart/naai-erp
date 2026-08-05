import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";

@Injectable()
export class EvidenceObjectStorage {
  private readonly memory = new Map<string, Buffer>();
  private readonly bucket = process.env.OBJECT_STORAGE_BUCKET ?? "naai-erp-evidence-dev";
  private readonly client?: S3Client;

  constructor() {
    if (process.env.OBJECT_STORAGE_BUCKET) {
      const config: S3ClientConfig = {
        region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
        ...(process.env.OBJECT_STORAGE_ENDPOINT
          ? { endpoint: process.env.OBJECT_STORAGE_ENDPOINT, forcePathStyle: true }
          : {}),
        ...(process.env.OBJECT_STORAGE_ACCESS_KEY && process.env.OBJECT_STORAGE_SECRET_KEY
          ? {
              credentials: {
                accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY,
                secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY,
              },
            }
          : {}),
      };
      this.client = new S3Client(config);
    }
  }

  bucketName() {
    return this.bucket;
  }

  async put(key: string, bytes: Buffer, mediaType: string) {
    if (!this.client) {
      this.memory.set(key, Buffer.from(bytes));
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mediaType,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  async signedDownload(key: string, filename: string, seconds: number) {
    if (!this.client)
      return `memory://evidence/${encodeURIComponent(key)}?expiresIn=${seconds}&filename=${encodeURIComponent(filename)}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: seconds },
    );
  }
}
