import type { JournalActorContext } from "../journals/journal.types.js";

export type ProjectRecognitionContext = JournalActorContext;
export type RecognitionResource =
  | "scope-changes"
  | "project-budgets"
  | "recognition-policies"
  | "milestone-acceptances"
  | "revenue-recognition-events";
export type ProjectRecognitionStore = Readonly<{
  list(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    projectId?: string,
    state?: string,
  ): Promise<unknown>;
  get(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    id: string,
  ): Promise<unknown | undefined>;
  create(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transition(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  revenuePosition(c: ProjectRecognitionContext, projectId: string, asOf?: string): Promise<unknown>;
}>;
export const PROJECT_RECOGNITION_STORE = Symbol("PROJECT_RECOGNITION_STORE");
