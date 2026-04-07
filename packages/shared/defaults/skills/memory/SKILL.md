---
name: memory
description: >
  Search, view, and edit the orch8 project memory: knowledge entities,
  facts, and lessons. Use when the user wants to know what the project
  "remembers", add a lesson learned, or correct/remove a stale fact.
  Do NOT use for runtime task state (that's the `tasks` skill) or for
  agent system prompts (that's the `agents` skill).
---

# Memory Skill

orch8 stores durable project knowledge in three forms:
- **Knowledge entities** — long-lived "things" in the project (areas,
  archives, the project itself).
- **Facts** — atomic statements attached to an entity, with a category
  (`decision`, `status`, `milestone`, `issue`, `relationship`,
  `convention`, `observation`).
- **Lessons** — agent-authored summaries of "what we learned trying X".

## Endpoints

| Action | Method | Endpoint |
|---|---|---|
| Search memory | GET | `/api/memory/search?projectId={id}&q={query}` |
| List entities | GET | `/api/memory/entities?projectId={id}` |
| Get entity | GET | `/api/memory/entities/{entityId}` |
| Update entity | PATCH | `/api/memory/entities/{entityId}` |
| Add fact | POST | `/api/memory/facts` |
| Update fact | PATCH | `/api/memory/facts/{factId}` |
| Delete fact | DELETE | `/api/memory/facts/{factId}` |
| Add lesson | POST | `/api/memory/lessons` |

## Card kinds

| Kind | Buttons | Payload essentials |
|---|---|---|
| `confirm_update_memory_entity` | Approve / Cancel | `entityId`, `current`, `proposed` |
| `confirm_add_lesson` | Approve / Cancel | `title`, `body`, `tags?` |
| `info_memory_search` | none | `query`, `results: { kind, id, snippet }[]` |
| `result_add_lesson` | Open | `lessonId`, `title` |
| `result_update_memory_entity` | Open | `entityId`, `fieldsChanged` |

## Common flows

### "What do we know about the auth migration?"

```orch8-card
{
  "kind": "info_memory_search",
  "summary": "5 results for 'auth migration'",
  "payload": {
    "query": "auth migration",
    "results": [
      { "kind": "fact", "id": "fact_a", "snippet": "Decision: switch from JWT to opaque session tokens (2026-03-12)" },
      { "kind": "fact", "id": "fact_b", "snippet": "Issue: legacy JWT verifier still in use in mobile clients" },
      { "kind": "lesson", "id": "lesson_x", "snippet": "Lesson: always rotate session secrets after a migration" }
    ]
  }
}
```

### "Save a lesson: prefer one bundled PR over many small ones for refactors"

```orch8-card
{
  "kind": "confirm_add_lesson",
  "summary": "Add lesson: prefer bundled PRs for refactors",
  "payload": {
    "title": "Prefer bundled PRs for refactors",
    "body": "When refactoring across multiple files, ship as one bundled PR rather than splitting. Splits create review churn without reducing risk because reviewers re-load context anyway.",
    "tags": ["pr-strategy", "refactoring"]
  }
}
```

### "That fact is wrong, the migration target is sonnet not opus"

```orch8-card
{
  "kind": "confirm_update_memory_entity",
  "summary": "Update entity ent_abc auth-migration-target",
  "payload": {
    "entityId": "ent_abc",
    "current": { "description": "Migration target: claude-opus-4-6" },
    "proposed": { "description": "Migration target: claude-sonnet-4-6" }
  }
}
```

For card emission rules, see the `_card-protocol` skill.
