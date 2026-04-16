import { FormField } from "../shared/FormField.js";

const MODELS = [
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

export interface IdentityData {
  name: string;
  slug: string;
  model: string;
  effort: string;
  maxTurns: number;
}

interface IdentityStepProps {
  data: IdentityData;
  onChange: (data: IdentityData) => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function IdentityStep({ data, onChange }: IdentityStepProps) {
  function update(partial: Partial<IdentityData>) {
    onChange({ ...data, ...partial });
  }

  return (
    <div className="flex flex-col gap-[var(--gap-block)]">
      <FormField label="Name" description="Display name for this agent" required>
        <input
          value={data.name}
          onChange={(e) => {
            update({ name: e.target.value, slug: slugify(e.target.value) });
          }}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>

      <FormField label="Slug" description="Auto-generated from name, used as the agent ID">
        <input
          value={data.slug}
          onChange={(e) => update({ slug: e.target.value })}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>

      <FormField label="Model">
        <select
          value={data.model}
          onChange={(e) => update({ model: e.target.value })}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Effort Level">
        <select
          value={data.effort}
          onChange={(e) => update({ effort: e.target.value })}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        >
          {EFFORT_LEVELS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Max Turns per Run">
        <input
          type="number"
          min={1}
          value={data.maxTurns}
          onChange={(e) => update({ maxTurns: parseInt(e.target.value) || 180 })}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>
    </div>
  );
}
