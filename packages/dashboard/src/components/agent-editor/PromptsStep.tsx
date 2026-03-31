import { FormField } from "../shared/FormField.js";
import { MarkdownEditor } from "../shared/MarkdownEditor.js";

export interface PromptsData {
  instructionsFilePath: string;
  systemPrompt: string;
  promptTemplate: string;
  bootstrapPromptTemplate: string;
  skillPaths: string[];
}

interface PromptsStepProps {
  data: PromptsData;
  onChange: (data: PromptsData) => void;
}

export function PromptsStep({ data, onChange }: PromptsStepProps) {
  function update(partial: Partial<PromptsData>) {
    onChange({ ...data, ...partial });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField
        label="Instructions File Path"
        description="Path to AGENTS.md or similar markdown file appended to system prompt"
      >
        <input
          value={data.instructionsFilePath}
          onChange={(e) => update({ instructionsFilePath: e.target.value })}
          placeholder="/path/to/AGENTS.md"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>

      <FormField label="System Prompt" description="Additional system prompt content">
        <MarkdownEditor
          value={data.systemPrompt}
          onChange={(v) => update({ systemPrompt: v })}
          placeholder="Instructions for the agent..."
        />
      </FormField>

      <FormField
        label="Heartbeat Prompt Template"
        description="Per-run prompt with {{variable}} interpolation"
      >
        <MarkdownEditor
          value={data.promptTemplate}
          onChange={(v) => update({ promptTemplate: v })}
          placeholder="{{task_title}}: {{task_description}}"
        />
      </FormField>

      <FormField
        label="Bootstrap Prompt Template"
        description="First-run-only prompt"
      >
        <MarkdownEditor
          value={data.bootstrapPromptTemplate}
          onChange={(v) => update({ bootstrapPromptTemplate: v })}
          placeholder="Welcome to the project. Start by..."
        />
      </FormField>

      <FormField
        label="Skill File Paths"
        description="Comma-separated list of markdown file paths injected via --add-dir"
      >
        <input
          value={data.skillPaths.join(", ")}
          onChange={(e) =>
            update({
              skillPaths: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="/path/to/skill1.md, /path/to/skill2.md"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </FormField>
    </div>
  );
}
