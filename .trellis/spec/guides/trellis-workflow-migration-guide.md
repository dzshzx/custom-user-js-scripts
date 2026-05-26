# Trellis Workflow Migration Guide

Use this guide when changing `.trellis/workflow.md` templates or Trellis dispatch mode.

## Template Migration Sequence

1. Generate the official template beside the active workflow:
   ```bash
   trellis workflow --template channel-driven-subagent-dispatch --create-new
   ```
2. Compare `.trellis/workflow.md` and `.trellis/workflow.md.new`.
3. Apply the official template with the official command:
   ```bash
   trellis workflow --template channel-driven-subagent-dispatch --force
   ```
4. Merge local conventions back into `.trellis/workflow.md` with the official template as the skeleton.

Do not handwrite a replacement if the official template cannot be downloaded. Try direct access first, then existing repository or system proxy settings; if it still fails, stop and report.

## Files To Keep Together

`.trellis/.template-hashes.json` is template state. If `trellis workflow --force` changes it, keep that change with the workflow migration instead of treating it as unrelated noise.

## Channel-Driven Dispatch Contract

In the channel-driven workflow, Phase 2 defaults to channel worker agents:

- Implementation: `trellis channel spawn --agent implement`
- Check: `trellis channel spawn --agent check`
- Worker definitions: `.trellis/agents/implement.md` and `.trellis/agents/check.md`

Host-native agents such as `.codex/agents/*.toml`, Claude Task agents, and similar platform-specific sub-agents are fallback only. Use them when the user explicitly requests native dispatch or a host-only capability is required.

## Smoke Test Practice

Use a temporary Trellis task to prove channel worker behavior. The smoke task should only validate channel mechanics and must not modify business code.

After the test, archive the smoke task instead of deleting it:

```bash
python3 ./.trellis/scripts/task.py archive <smoke-task> --no-commit
```

This keeps an auditable record and avoids automatic commits.

## Dispatch Verification

After migration, verify step-level guidance still points to channel workers:

```bash
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.1 --platform codex
python3 ./.trellis/scripts/get_context.py --mode phase --step 2.2 --platform codex
```

The output should show `trellis channel spawn --agent implement` for implementation and `trellis channel spawn --agent check` for quality check.
