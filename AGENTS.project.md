# MOSA Editor Working Agreement

## Model-gated workflow

Every new implementation task starts with an architecture gate before code is
changed.

1. Ask the `astra_architect` agent to inspect the request and the affected code.
   It must return risks, invariants, a bounded plan, acceptance criteria, and a
   recommended agent for every step.
2. Do not begin implementation until the Astra review is complete. If the
   review finds an irreversible schema, engine, or product decision, summarize
   the decision for the user before proceeding.
3. Route each approved step to the narrowest suitable agent:
   - `sol_engineer`: reconstruction engine, CSG/geometry, schemas, complex
     refactors, state integration, and difficult debugging.
   - `terra_editor`: editor UI, ordinary React/state work, focused integration,
     and browser-facing fixes.
   - `luna_maintainer`: mechanical cleanup, naming, documentation, formatting,
     and narrowly specified repetitive edits.
4. Keep shared contracts and overlapping writes sequential. Parallelize only
   independent read-heavy investigation or non-overlapping implementation.
5. After implementation, return to `astra_architect` for a read-only review of
   architecture drift, regressions, and acceptance criteria. Fix material
   findings with the assigned implementation agent.

The primary agent owns orchestration, integration, user communication, and the
final decision. Subagent output is advice or a bounded change, never automatic
approval.

## Engine priorities

- Preserve the editor experience while allowing dynamic addition and removal
  of editable segments.
- Reconstruct the whole silhouette and major masses before deciding segment
  boundaries.
- Prefer compound solids and constructive add/subtract operations over isolated
  primitive rows. Avoid can-like, block-like, or slot-first results.
- A single thumbnail is the only required input. Store the derived editable
  specification rather than the copyrighted source image unless the user asks
  otherwise.
- Keep the result recognizably inspired by the reference while applying
  deliberate proportion, surface, and detail changes.

## Verification gate

- Run type checking and a production build after code changes.
- UI work is incomplete until the relevant success, loading, empty, and error
  states have been rendered and inspected in a browser at desktop and mobile
  sizes, with console errors checked.
- Prefer the shared in-app browser for a reachable local preview. If the current
  environment cannot expose its local server to that browser, use a deployed
  branch preview URL. If neither is available, report visual QA as blocked and
  do not describe the UI milestone as complete.
- For reconstruction work, visually check silhouette, mass hierarchy, compound
  head/torso construction, segment selection, transform editing, mirroring, and
  explode view.

