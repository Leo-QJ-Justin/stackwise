# Hierarchical Skills Lab Sidebar

**Date:** 2026-03-13
**Status:** Approved
**Branch:** feat/skill-composition

## Problem

The Skills Lab sidebar displays a flat list of all `toolsRegistry` entries (plugins, skills, commands, MCP servers) grouped by tier. This causes two issues:

1. **UX/navigation**: The list is noisy — plugins appear alongside their child skills, and plugins with many children (e.g., Superpowers with 56 skills) create an overwhelming flat list.
2. **Data integrity**: Plugins, commands, and MCP servers appear checkable in compose mode, but composition only works with skills. Attempting to compose a non-skill entity would fail at save time with no early feedback.

## Decisions

- **Plugins as collapsible groups**: Plugins become section headers in the sidebar. Their child skills are listed underneath, expandable/collapsible via chevron toggle.
- **Group by plugin first**: Top-level grouping is by source (plugin), not by tier. Tier is shown as an inline badge on each skill.
- **Skills only**: The sidebar filters to `capabilityType === "skill"` only. Commands and MCP servers are not shown — they are implementation details of plugins that skills already reference internally. They remain visible on the stack dashboard.
- **"My Skills" group**: Self-created skills (`source === "self_created"`) appear in a dedicated group at the top of the sidebar, separate from plugin groups.

## Scope

Two files change:

1. `app/api/skills/route.ts` — new response shape
2. `components/skills-lab/skills-sidebar.tsx` — rewrite to render plugin groups

Everything else is unchanged: compose drawer, focus graph, detail header, composition model, save/compose/regenerate routes, stack dashboard, `lib/types.ts` (except adding a `PluginGroup` type).

## API: `GET /api/skills`

### Current response

```json
{
  "skills": [
    { "id": 1, "name": "...", "capabilityType": "plugin", ... },
    { "id": 2, "name": "...", "capabilityType": "skill", ... },
    { "id": 3, "name": "...", "capabilityType": "command", ... }
  ]
}
```

All entity types returned. Client filters to `status === "active"`.

### New response

```json
{
  "plugins": [
    {
      "id": 12,
      "name": "Document Skills",
      "skills": [
        { "id": 45, "name": "pdf", "tier": 0, "mergeType": null, "baseSkills": [], "usedByCount": 0, ... },
        { "id": 46, "name": "docx", "tier": 0, "mergeType": null, "baseSkills": [], "usedByCount": 0, ... }
      ]
    }
  ],
  "standalone": [
    { "id": 99, "name": "my-custom-skill", "tier": 1, "mergeType": "orchestrator", "baseSkills": [...], "usedByCount": 0, ... }
  ]
}
```

**Server-side filtering:**
- Only `capabilityType === "skill"` and `status === "active"` rows are returned.
- Skills with `parentPluginId` are grouped under their parent plugin.
- Skills without `parentPluginId` go into `standalone` (primarily `source === "self_created"`, but any orphaned skill without a parent is treated the same way).
- Plugins with zero active skills are omitted.
- Composition metadata (`baseSkills`, `usedByCount`) is enriched per skill as before (batch query, no N+1).

**Resolving plugin names:** The route collects distinct `parentPluginId` values from the filtered skills, then batch-fetches those plugin rows from `toolsRegistry` to get their `id` and `name`. If a parent plugin row has been deleted or archived, its orphaned skills fall into `standalone`.

**Query param `source`** is removed — it was unused by the Skills Lab.

## Sidebar UI: `components/skills-lab/skills-sidebar.tsx`

### Layout

```
┌─────────────────────────┐
│ [Compose Skills]        │
│ [Search skills...]      │
├─────────────────────────┤
│ > My Skills (2)         │  <- self-created, always first
│   ├ my-workflow  T1 ORCH│
│   └ my-mutant    T1 MUT │
│                         │
│ v Superpowers (12)      │  <- expanded plugin
│   ├ brainstorming       │
│   ├ writing-plans       │
│   └ ...                 │
│                         │
│ > Document Skills (17)  │  <- collapsed plugin
│ > Planning With Files(3)│
│ ...                     │
├─────────────────────────┤
│ 3 skills selected       │  <- compose mode footer (unchanged)
└─────────────────────────┘
```

### Behavior

- **Plugin headers**: Chevron toggle to expand/collapse. Shows plugin name and active skill count. Not selectable, not checkable.
- **Skill items**: Clickable to select (view in focus graph). In compose mode, checkable to add as base skill.
- **Tier badges**: Shown inline on each skill (T0/T1/T2 with color coding).
- **Merge type badges**: Shown inline (ORCH/MUT) as before.
- **Search**: Filters across all groups. Auto-expands plugins that contain matching skills. Plugins with no matches are hidden.
- **Collapse state**: React state (`useState`), resets on page navigation. Not persisted.
- **"My Skills" group**: Uses the same collapsible pattern but is visually distinguished (always first, different header style or label).

### Compose mode

- Only skill items get checkboxes.
- Plugin headers remain inert — no "select all skills in plugin" behavior.
- Selected count footer unchanged.

## Types: `lib/types.ts`

Add one new interface:

```typescript
export interface PluginGroup {
  id: number;
  name: string;
  skills: SkillListItem[];
}
```

`SkillListItem` stays unchanged.

## What does NOT change

- `components/skills-lab/compose-drawer.tsx` — same workflow
- `components/skills-lab/focus-graph.tsx` — queries by skill ID, unaffected
- `components/skills-lab/skill-detail-header.tsx` — same display
- `lib/composition.ts` — validation, tier calc, cycle detection unchanged
- `app/api/skills/save/route.ts` — unchanged
- `app/api/skills/compose/route.ts` — unchanged
- `app/api/skills/[id]/regenerate/route.ts` — unchanged
- `app/api/skills/[id]/graph/route.ts` — unchanged
- `components/stack-dashboard.tsx` — separate concern
- `lib/db/schema.ts` — no schema changes

## Test plan

- [ ] Fresh DB + scan: sidebar shows plugins as collapsible groups with only skills inside
- [ ] Plugins with zero skills (e.g., if a plugin has only commands/MCP) do not appear in sidebar
- [ ] "My Skills" group appears at top when self-created skills exist, hidden when none
- [ ] Search filters skills across all plugin groups, auto-expands matching groups
- [ ] Compose mode: only skills get checkboxes, plugin headers are inert
- [ ] Selecting a skill still shows focus graph and detail header correctly
- [ ] Compose + save workflow still works end to end
- [ ] Extend workflow (from detail header) still pre-populates compose drawer correctly
- [ ] Orphaned skills (parentPluginId points to deleted/archived plugin) appear in standalone group
- [ ] Empty state: no plugins and no standalone skills shows appropriate empty message
