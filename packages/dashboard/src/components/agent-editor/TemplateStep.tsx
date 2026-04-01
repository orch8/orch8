export interface AgentTemplate {
  key: string;
  label: string;
  description: string;
  defaults: {
    role: string;
    model: string;
    systemPrompt: string;
    canCreateTasks: boolean;
    canMoveTo: string[];
  };
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "implementer",
    label: "Implementer",
    description: "Writes code and creates PRs",
    defaults: {
      role: "implementer",
      model: "claude-opus-4-6",
      systemPrompt: "You are an implementation agent. Write clean, tested code.",
      canCreateTasks: false,
      canMoveTo: ["in_progress", "done"],
    },
  },
  {
    key: "reviewer",
    label: "Reviewer",
    description: "Adversarial verifier with read-only access",
    defaults: {
      role: "verifier",
      model: "claude-opus-4-6",
      systemPrompt: "You are a code reviewer. Verify implementations thoroughly.",
      canCreateTasks: false,
      canMoveTo: ["done"],
    },
  },
  {
    key: "researcher",
    label: "Researcher",
    description: "Handles research phases",
    defaults: {
      role: "researcher",
      model: "claude-opus-4-6",
      systemPrompt: "You are a research agent. Investigate and document findings.",
      canCreateTasks: false,
      canMoveTo: ["in_progress"],
    },
  },
  {
    key: "brainstormer",
    label: "Brainstormer",
    description: "Interactive brainstorm sessions",
    defaults: {
      role: "custom",
      model: "claude-opus-4-6",
      systemPrompt: "You are a brainstorming partner. Help explore ideas creatively.",
      canCreateTasks: true,
      canMoveTo: ["backlog"],
    },
  },
  {
    key: "referee",
    label: "Referee",
    description: "Resolves disputes between agents",
    defaults: {
      role: "referee",
      model: "claude-opus-4-6",
      systemPrompt: "You are a referee. Make final decisions on disputed tasks.",
      canCreateTasks: false,
      canMoveTo: ["done"],
    },
  },
  {
    key: "blank",
    label: "Blank Agent",
    description: "Start from scratch with empty config",
    defaults: {
      role: "custom",
      model: "claude-sonnet-4-6",
      systemPrompt: "",
      canCreateTasks: false,
      canMoveTo: [],
    },
  },
];

interface TemplateStepProps {
  selectedTemplate: string | null;
  onSelect: (template: AgentTemplate) => void;
}

export function TemplateStep({ selectedTemplate, onSelect }: TemplateStepProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {AGENT_TEMPLATES.map((template) => (
        <button
          key={template.key}
          type="button"
          onClick={() => onSelect(template)}
          className={`rounded-lg border p-4 text-left transition-colors ${
            selectedTemplate === template.key
              ? "border-blue-500 bg-blue-950/30"
              : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
          }`}
        >
          <p className="font-medium text-zinc-100">{template.label}</p>
          <p className="mt-1 text-xs text-zinc-500">{template.description}</p>
        </button>
      ))}
    </div>
  );
}
