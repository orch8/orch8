import { BaseResultCard } from "../BaseResultCard.js";
import type { CardComponentProps } from "../cardTypes.js";

export function ResultErrorCard({ card }: CardComponentProps<"result_error">) {
  const { reason, httpStatus, endpoint, rawResponse } = card.payload;
  return (
    <BaseResultCard variant="error" title={card.summary || "Error"}>
      <p className="text-xs text-red-300">{reason}</p>
      {(httpStatus || endpoint) && (
        <p className="mt-1 text-[10px] text-zinc-500">
          {httpStatus && `HTTP ${httpStatus}`}
          {httpStatus && endpoint && " · "}
          {endpoint && <span className="font-mono">{endpoint}</span>}
        </p>
      )}
      {rawResponse && (
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
          {rawResponse}
        </pre>
      )}
    </BaseResultCard>
  );
}
