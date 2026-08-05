import type { JournalActorContext } from "../journals/journal.types.js";

export type EvidenceContext = JournalActorContext;
export type UploadEvidenceInput = Readonly<{
  evidenceId?: string;
  subjectType: "commercial_document" | "expense" | "contract" | "project" | "milestone";
  subjectId: string;
  evidenceType: string;
  originalFilename: string;
  declaredMediaType: string;
  contentBase64: string;
  source: string;
}>;
export type ReviewEvidenceInput = Readonly<{
  version?: number;
  state: "accepted" | "rejected" | "needs_review";
  reason: string;
  reference?: string;
}>;
export type DownloadEvidenceInput = Readonly<{
  version?: number;
  reason: string;
  expiresInSeconds?: number;
}>;
