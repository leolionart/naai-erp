export const EVIDENCE_MEDIA_TYPES = [
  "application/pdf",
  "application/xml",
  "image/png",
  "image/jpeg",
] as const;
export type EvidenceMediaType = (typeof EVIDENCE_MEDIA_TYPES)[number];
export type EvidenceStatus = "active" | "superseded" | "quarantined";
export type EvidenceReviewState = "pending" | "accepted" | "rejected" | "needs_review";

const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

export function detectEvidenceMediaType(bytes: Uint8Array): EvidenceMediaType | undefined {
  if (ascii(bytes.subarray(0, 5)) === "%PDF-") return "application/pdf";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    return "image/png";
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  )
    return "image/jpeg";
  const text = ascii(bytes.subarray(0, Math.min(bytes.length, 256))).trimStart();
  if (text.startsWith("<?xml") || /^<[A-Za-z_][\w:.-]*(\s|>)/.test(text)) return "application/xml";
  return undefined;
}

export function validateEvidenceUpload(
  bytes: Uint8Array,
  declaredMediaType: string,
  filename: string,
  maxBytes = 20 * 1024 * 1024,
) {
  if (bytes.length === 0) throw new Error("EVIDENCE_EMPTY");
  if (bytes.length > maxBytes) throw new Error("EVIDENCE_TOO_LARGE");
  if (!filename.trim()) throw new Error("VALIDATION_FAILED");
  const detectedMediaType = detectEvidenceMediaType(bytes);
  if (!detectedMediaType) throw new Error("EVIDENCE_MEDIA_UNSUPPORTED");
  if (detectedMediaType !== declaredMediaType) throw new Error("EVIDENCE_MEDIA_MISMATCH");
  if (detectedMediaType === "application/xml") {
    const text = ascii(bytes);
    if (/<!DOCTYPE|<!ENTITY|<script|<html/i.test(text)) throw new Error("EVIDENCE_XML_UNSAFE");
  }
  return { detectedMediaType, byteSize: bytes.length };
}

export function nextEvidenceVersion(input: {
  organizationId: string;
  evidenceId: string;
  current: readonly { version: number; status: EvidenceStatus }[];
  generatedKeySuffix?: string;
}) {
  const active = input.current.find((item) => item.status === "active");
  const version = Math.max(0, ...input.current.map((item) => item.version)) + 1;
  return {
    version,
    supersedesVersion: active?.version,
    objectKey: `${input.organizationId}/${input.evidenceId}/${version}/${input.generatedKeySuffix ?? "generated"}`,
  };
}

export function reviewEvidence(
  evidence: { status: EvidenceStatus; reviewState: EvidenceReviewState },
  state: Exclude<EvidenceReviewState, "pending">,
  reason: string,
  actorId: string,
) {
  if (evidence.status !== "active") throw new Error("EVIDENCE_VERSION_NOT_ACTIVE");
  if (!reason.trim()) throw new Error("EVIDENCE_REVIEW_REASON_REQUIRED");
  if (!actorId.trim()) throw new Error("VALIDATION_FAILED");
  return { ...evidence, reviewState: state, reviewReason: reason.trim(), reviewedBy: actorId };
}
