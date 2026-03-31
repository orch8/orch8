import { useState } from "react";
import { useComments, useCreateComment } from "../../hooks/useComments.js";
import { MarkdownRenderer } from "../shared/MarkdownRenderer.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";

interface CommentThreadProps {
  taskId: string;
}

const TYPE_STYLES: Record<string, { border: string; badge?: { text: string; color: string } }> = {
  verification: { border: "border-l-2 border-l-emerald-500", badge: { text: "VERIFICATION", color: "text-emerald-400" } },
  system: { border: "border-l-2 border-l-zinc-600" },
  brainstorm: { border: "border-l-2 border-l-purple-500" },
  inline: { border: "" },
};

export function CommentThread({ taskId }: CommentThreadProps) {
  const { data: comments, isLoading } = useComments(taskId);
  const createComment = useCreateComment();
  const [body, setBody] = useState("");

  function handleSubmit() {
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
        {comments?.map((comment) => {
          const style = TYPE_STYLES[comment.type] ?? TYPE_STYLES.inline;
          return (
            <div
              key={comment.id}
              className={`rounded-md border border-zinc-800 bg-zinc-900/50 p-2 ${style.border}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-300">
                  {comment.author}
                </span>
                {style.badge && (
                  <span className={`text-[10px] font-bold uppercase ${style.badge.color}`}>
                    {style.badge.text}
                  </span>
                )}
                <span className="text-xs text-zinc-600">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <MarkdownRenderer content={comment.body} />
            </div>
          );
        })}
      </div>

      <MarkdownEditor
        value={body}
        onChange={setBody}
        onSubmit={handleSubmit}
        placeholder="Add a comment (Cmd+Enter to submit)..."
      />
    </div>
  );
}
