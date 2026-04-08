import type { ReactNode } from "react";
import type { ExtractedCard } from "@orch/shared";
import { useCardDecision } from "../../../hooks/useCardDecision.js";

interface BaseConfirmCardProps {
  title: string;
  summary: string;
  extracted: ExtractedCard;
  chatId: string;
  children: ReactNode;
}

export function BaseConfirmCard({
  title,
  summary,
  extracted,
  chatId,
  children,
}: BaseConfirmCardProps) {
  const decision = useCardDecision();
  const isPending = extracted.status === "pending";
  const isApproved = extracted.status === "approved";
  const isCancelled = extracted.status === "cancelled";

  const onApprove = () => {
    if (!isPending) return;
    decision.mutate({ chatId, cardId: extracted.id, decision: "approved" });
  };

  const onCancel = () => {
    if (!isPending) return;
    decision.mutate({ chatId, cardId: extracted.id, decision: "cancelled" });
  };

  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        isApproved
          ? "border-emerald-700/50 bg-emerald-950/10"
          : isCancelled
            ? "border-zinc-700 bg-zinc-950"
            : "border-amber-700/60 bg-amber-950/10"
      }`}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">
            Confirm
          </div>
          <div className="text-sm font-semibold text-zinc-100">{title}</div>
        </div>
        {extracted.status !== "pending" && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
              isApproved
                ? "bg-emerald-900/40 text-emerald-300"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {extracted.status}
          </span>
        )}
      </div>

      <div className="px-4 py-3 text-xs text-zinc-400">{summary}</div>
      <div className="px-4 pb-3 text-sm text-zinc-200">{children}</div>

      <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-2">
        <button
          onClick={onCancel}
          disabled={!isPending || decision.isPending}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onApprove}
          disabled={!isPending || decision.isPending}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
