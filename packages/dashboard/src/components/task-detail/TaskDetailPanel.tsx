export function TaskDetailPanel({ taskId }: { taskId: string }) {
  return (
    <div className="w-96 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm text-zinc-400">Task: {taskId}</p>
    </div>
  );
}
