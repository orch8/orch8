import type { pipelines, pipelineSteps } from "../db/pipeline-schema.js";

/**
 * Shape returned by GET /api/pipelines/:id — see
 * packages/daemon/src/services/pipeline.service.ts → getWithSteps().
 *
 * Note: fields typed as Drizzle Date columns will arrive as ISO strings over
 * the wire; the static shape uses the `$inferSelect` types here and callers
 * that read JSON should treat date fields accordingly. This matches the prior
 * dashboard-local definition verbatim.
 */
export interface PipelineWithSteps {
  pipeline: typeof pipelines.$inferSelect;
  steps: (typeof pipelineSteps.$inferSelect)[];
}
