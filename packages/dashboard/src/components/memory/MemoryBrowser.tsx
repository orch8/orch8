import { useState } from "react";
import { useEntities, useSearchFacts, useWorklog, useLessons } from "../../hooks/useMemory.js";
import { useCreateEntity } from "../../hooks/useMemoryMutations.js";
import { FormField } from "../shared/FormField.js";
import { EntityDetail } from "./EntityDetail.js";

const TYPE_FILTERS = [
  { value: undefined, label: "All" },
  { value: "project", label: "Project" },
  { value: "area", label: "Area" },
  { value: "archive", label: "Archive" },
] as const;

interface MemoryBrowserProps {
  projectId: string;
}

export function MemoryBrowser({ projectId }: MemoryBrowserProps) {
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"entities" | "worklog" | "lessons">("entities");
  const [worklogAgentId, setWorklogAgentId] = useState("");

  const createEntity = useCreateEntity();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("area");
  const [newEntityDesc, setNewEntityDesc] = useState("");

  const { data: entities, isLoading } = useEntities(projectId, typeFilter);
  const { data: searchResults } = useSearchFacts(searchQuery);
  const { data: worklogData } = useWorklog(worklogAgentId || undefined);
  const { data: lessonsData } = useLessons(worklogAgentId || undefined);

  return (
    <div className="flex h-full gap-4">
      {/* Entity list sidebar */}
      <div className="flex w-72 shrink-0 flex-col gap-3">
        {/* Search */}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search facts..."
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
        />

        {/* Type filters */}
        <div className="flex gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setTypeFilter(f.value)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* New Entity Button + Form */}
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-600"
        >
          + New Entity
        </button>

        {showCreateForm && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await createEntity.mutateAsync({
                projectId,
                name: newEntityName,
                entityType: newEntityType,
                description: newEntityDesc || undefined,
              });
              setNewEntityName("");
              setNewEntityDesc("");
              setShowCreateForm(false);
            }}
            className="flex flex-col gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <FormField label="Name">
              <input
                value={newEntityName}
                onChange={(e) => setNewEntityName(e.target.value)}
                required
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              />
            </FormField>
            <FormField label="Type">
              <select
                value={newEntityType}
                onChange={(e) => setNewEntityType(e.target.value)}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              >
                <option value="project">Project</option>
                <option value="area">Area</option>
                <option value="archive">Archive</option>
              </select>
            </FormField>
            <FormField label="Description">
              <input
                value={newEntityDesc}
                onChange={(e) => setNewEntityDesc(e.target.value)}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
              />
            </FormField>
            <button
              type="submit"
              disabled={!newEntityName.trim() || createEntity.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              Create
            </button>
          </form>
        )}

        {isLoading && <p className="text-xs text-zinc-600">Loading entities...</p>}

        <div className="flex flex-col gap-1 overflow-y-auto">
          {searchQuery && searchResults && searchResults.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-xs font-medium text-zinc-500">
                Search Results ({searchResults.length})
              </p>
              {searchResults.map((fact) => (
                <div key={fact.id} className="mb-1 rounded border border-zinc-800 bg-zinc-900/50 p-2">
                  <span className="mb-1 inline-block rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-500">
                    {fact.category}
                  </span>
                  <p className="line-clamp-2 text-xs text-zinc-400">{fact.content}</p>
                </div>
              ))}
            </div>
          )}

          {entities?.map((entity) => (
            <button
              key={entity.id}
              onClick={() => setSelectedEntityId(entity.id)}
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedEntityId === entity.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <p className="font-medium">{entity.name}</p>
              <p className="text-xs text-zinc-600">{entity.entityType}</p>
            </button>
          ))}

          {entities?.length === 0 && !isLoading && (
            <p className="px-3 text-sm text-zinc-600">No entities found</p>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="mb-4 flex gap-1 border-b border-zinc-800 pb-2">
          {(["entities", "worklog", "lessons"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium capitalize ${
                activeTab === tab
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "entities" && (
          selectedEntityId ? (
            <EntityDetail entityId={selectedEntityId} />
          ) : (
            <p className="text-sm text-zinc-600">Select an entity to view its facts and history</p>
          )
        )}

        {activeTab === "worklog" && (
          <div className="flex flex-col gap-3">
            <input
              value={worklogAgentId}
              onChange={(e) => setWorklogAgentId(e.target.value)}
              placeholder="Agent ID..."
              className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            {worklogData?.entries.map((entry, i) => (
              <div key={i} className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="whitespace-pre-wrap text-sm text-zinc-300">{entry.content}</p>
              </div>
            ))}
            {worklogData?.entries.length === 0 && (
              <p className="text-sm text-zinc-600">No worklog entries</p>
            )}
          </div>
        )}

        {activeTab === "lessons" && (
          <div className="flex flex-col gap-3">
            <input
              value={worklogAgentId}
              onChange={(e) => setWorklogAgentId(e.target.value)}
              placeholder="Agent ID..."
              className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
            {lessonsData?.content ? (
              <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                {lessonsData.content}
              </pre>
            ) : (
              <p className="text-sm text-zinc-600">No lessons recorded</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
