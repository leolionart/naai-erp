import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { API_VERSION } from "@naai-erp/contracts";
import { validateEvidenceUpload } from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import { EvidenceObjectStorage } from "./evidence-object-storage.js";
import { PgEvidenceStore } from "./pg-evidence.store.js";
import type {
  DownloadEvidenceInput,
  EvidenceContext,
  ReviewEvidenceInput,
  UploadEvidenceInput,
} from "./evidence.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant", "integration"]);
const REVIEW = new Set(["owner", "finance_admin", "accountant"]);
const READ = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(PgEvidenceStore) private readonly store: PgEvidenceStore,
    @Inject(EvidenceObjectStorage) private readonly objects: EvidenceObjectStorage,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: EvidenceContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(context: EvidenceContext, subjectType?: string, subjectId?: string) {
    if (!context.roles.some((role) => READ.has(role))) throw new Error("FORBIDDEN");
    return this.envelope(context, {
      items: await this.store.list(context.organizationId, subjectType, subjectId),
    });
  }
  async get(context: EvidenceContext, id: string) {
    if (!context.roles.some((role) => READ.has(role))) throw new Error("FORBIDDEN");
    const result = await this.store.get(context.organizationId, id);
    if (!result) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, result);
  }
  async upload(context: EvidenceContext, input: UploadEvidenceInput, key?: string) {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.subjectId?.trim() || !input.evidenceType?.trim() || !input.source?.trim())
      throw new Error("VALIDATION_FAILED");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new Error("VALIDATION_FAILED");
    }
    const validation = {
      ...validateEvidenceUpload(bytes, input.declaredMediaType, input.originalFilename),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const prepared = await this.store.prepareUpload(context, input, validation, key);
    if (!prepared.idempotencyReplayed)
      await this.objects.put(prepared.objectKey, bytes, validation.detectedMediaType);
    return this.envelope(
      context,
      await this.store.completeUpload(context, prepared, this.objects.bucketName(), key),
    );
  }
  async review(context: EvidenceContext, id: string, input: ReviewEvidenceInput, key?: string) {
    if (!context.roles.some((role) => REVIEW.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("EVIDENCE_REVIEW_REASON_REQUIRED");
    return this.envelope(context, await this.store.review(context, id, input, key));
  }
  async download(context: EvidenceContext, id: string, input: DownloadEvidenceInput, key?: string) {
    if (!context.roles.some((role) => READ.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    const seconds = input.expiresInSeconds ?? 120;
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 300)
      throw new Error("EVIDENCE_DOWNLOAD_TTL_INVALID");
    const item = await this.store.authorizeDownload(
      context,
      id,
      input.version,
      input.reason,
      seconds,
      key,
    );
    const url = await this.objects.signedDownload(item.objectKey, item.originalFilename, seconds);
    return this.envelope(context, { ...item, url, expiresInSeconds: seconds });
  }
}
