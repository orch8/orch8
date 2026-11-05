import { createFileRoute, Link } from "@tanstack/react-router";
import { PipelineDetail } from "../../../../components/pipeline/PipelineDetail.js";
import { usePipeline } from "../../../../hooks/usePipelines.js";
import { useProject } from "../../../../hooks/useProjects.js";

function FeatureWorkflowPage() {
  const { projectSlug, pipelineId } = Route.useParams();
  const { data, isLoading, isError } = usePipeline(pipelineId);
  const { data: project, isLoading: projectLoading } = useProject(projectSlug);
  return <main className="flex flex-col gap-4 p-[var(--gap-section)]">
    <Link to="/projects/$projectSlug/pipelines" params={{ projectSlug }} className="text-sm text-blue-300 underline">Back to feature workflows</Link>
    <h1 className="type-section font-semibold text-zinc-100">Feature workflow</h1>
    {isLoading && <p role="status" className="text-sm text-zinc-400">Loading workflow...</p>}
    {(isError || (!isLoading && !data)) && <p role="alert" className="text-sm text-amber-300">Workflow unavailable. Check the link or return to the project workflows.</p>}
    {data && project && data.pipeline.projectId !== project.id && <p role="alert" className="text-sm text-amber-300">This workflow belongs to a different project. Open it from the matching project workflow list.</p>}
    {data && !projectLoading && project && data.pipeline.projectId === project.id && <>
      <p className="text-sm text-zinc-400">This link reopens the same plan, agent runs, review, repository diff and PR after a refresh. An agent run finishing does not mean its step is complete.</p>
      <PipelineDetail pipelineId={pipelineId} projectId={project.id} />
    </>}
  </main>;
}

export const Route = createFileRoute("/projects/$projectSlug/pipelines/$pipelineId")({
  component: FeatureWorkflowPage,
});