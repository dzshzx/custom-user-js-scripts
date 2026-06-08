# Design

## Documentation Model

Use this target model:

- `README.md`: project entrypoint, quick commands, install links, and navigation.
- `docs/`: human-facing script docs, runbooks, and project conventions.
- `docs/agents/`: engineering-skill configuration only.
- `CONTEXT.md`: domain glossary only.
- `.trellis/spec/frontend/`: implementation rules for userscripts, local tooling, and repository structure.
- `.trellis/tasks/`: planning and historical task evidence, not reader-facing documentation.

## Planned Changes

- Slim README where it acts as a detailed manual.
- Add or update docs pages for script-specific runbooks if README content moves.
- Add repository-structure governance to `.trellis/spec/frontend/directory-structure.md` or another existing spec file.
- Define the target source layout that the installable-userscript migration child should apply.
- Keep `docs/frontend-design-guidelines.md` and `docs/script-template.md` if they remain useful human-facing convention docs.

## Compatibility

- Keep `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` paths stable.
- Do not depend on `.trellis/tasks/archive/` for user-facing docs.
- Do not move files or change source behavior in this child; define the policy that the migration child applies.

## Rollback

Revert this child task commit. Because no source entrypoints or scripts should move in this child, rollback should be documentation-only.
