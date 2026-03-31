import { FormField } from "../shared/FormField.js";

export interface BudgetData {
  totalBudgetLimit: string;
  autoPauseThreshold: string;
}

interface BudgetStepProps {
  data: BudgetData;
  onChange: (data: BudgetData) => void;
}

export function BudgetStep({ data, onChange }: BudgetStepProps) {
  function update(partial: Partial<BudgetData>) {
    onChange({ ...data, ...partial });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Total Budget Limit ($)" description="Lifetime cap on agent spend">
        <input
          type="number"
          min={0}
          step={0.01}
          value={data.totalBudgetLimit}
          onChange={(e) => update({ totalBudgetLimit: e.target.value })}
          placeholder="No limit"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>

      <FormField
        label="Auto-Pause Threshold (%)"
        description="Pause agent when reaching this percentage of total budget"
      >
        <input
          type="number"
          min={0}
          max={100}
          value={data.autoPauseThreshold}
          onChange={(e) => update({ autoPauseThreshold: e.target.value })}
          placeholder="90"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>
    </div>
  );
}
