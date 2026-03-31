import { useState } from "react";
import { useComments, useCreateComment } from "../../hooks/useComments.js";

interface CommentThreadProps {
  taskId: string;
}

export function CommentThread({ taskId }: CommentThreadProps) {
  const { data: comments, isLoading } = useComments(taskId);
  const createComment = useCreateComment();
  const [body, setBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    createComment.mutate(
      { taskId, author: "admin", body: body.trim() },
      { onSuccess: () => setBody("") },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Comments
      </h4>

      {isLoading && (
        <p className="text-xs text-zinc-600">Loading comments...</p>
      )}

      <div className="flex flex-col gap-2">
        {comments?.map((comment) => (
          <div
            key={comment.id}
            className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-300">
                {comment.author}
              </span>
              <span className="text-xs text-zinc-600">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-400">
              {comment.body}
            </p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!body.trim()}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
