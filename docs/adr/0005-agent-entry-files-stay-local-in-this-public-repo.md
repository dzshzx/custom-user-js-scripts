# Agent entry files stay local and gitignored in this public repository

- Status: accepted
- Date: 2026-06-17 (commit c321bd9 "Stop tracking developer tooling"; AGENTS.md briefly tracked on 2026-07-02 and ignored again); recorded 2026-08-23
- Related: .gitignore, docs/index.md, README.md "文档入口"

## Context

The repository is public and its tracked documents are read by people who
install the scripts. `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`,
`.agents/`, `.scratch/` and `docs/agents/` carry agent-runtime facts (local
tracker paths, workflow conventions, pitfalls) that are machine-specific and of
no use to installers.

## Decision

1. Those files are gitignored and maintained locally only.
2. Everything a public reader or a fresh agent needs to work safely must live in
   tracked documents: `README.md` (entry, commands), `PRODUCT.md` (boundaries,
   storage and version policy), `DESIGN.md` (UI rules), `CONTEXT.md`
   (vocabulary), `docs/scripts/` (per-script behaviour), `docs/adr/`
   (decisions). The local entry files hold pointers plus agent-only facts and
   must not be the sole owner of any project rule.
3. Tracked documents must not point at a gitignored file as an authority (the
   2026-08-23 audit found `docs/script-template.md` doing so for the version
   rule; it now points at `PRODUCT.md`).

## Consequences

- The local entry files have no remote backup and no history; their contents
  are re-derivable from the tracked documents, which is the accepted trade-off.
- A rule stated in an entry file and in a tracked document will drift unless
  the tracked document is treated as the owner; the release-gate wording drifted
  this way between 2026-08-17 and 2026-08-23.
