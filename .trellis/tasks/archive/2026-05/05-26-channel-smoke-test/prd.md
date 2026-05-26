# channel smoke test

## Goal

验证 Trellis channel worker 可以启动、读取任务上下文并完成只读回复。

## Requirements

- 只验证 channel。
- 不改业务代码。
- worker 只读取 `prd.md`、`implement.jsonl`、`check.jsonl`。
- worker 只回复一句确认。

## Acceptance Criteria

- [ ] worker 成功 spawn。
- [ ] `trellis channel wait` 在 5 分钟内等到 `done`。
- [ ] raw messages 显示 worker 读取了 `prd.md`、`implement.jsonl`、`check.jsonl`。
- [ ] worker 回复类似 `I read prd.md and both JSONL files.`

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
