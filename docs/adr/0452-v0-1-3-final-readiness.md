# 0452 - v0.1.3 final readiness checklist

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.33

## Context

ADR [0450](./0450-release-tag-head-guard.md) added the tag-vs-HEAD guard, and
ADR [0451](./0451-v0-1-3-release-notes.md) added checked-in final release
notes. The local checkout can still have a stale `v0.1.3` tag while local gates
and release notes look ready. Operators need one repo-local checklist that
separates local validation from explicit release mutation and requires the
stale-tag guard immediately before final tag push or draft Release trust.

## Decision

Add `docs/releases/v0.1.3-readiness.md` as the final readiness checklist for
the runtime TS prelude checkpoint, link it from the release skill, and protect
it with a normal `pnpm test` static contract. Rejected alternatives: moving or
deleting local tags would mutate release state without approval; pushing,
force-moving, or deleting remote tags is an external release operation; editing
or publishing the GitHub Release now would cross the human-owned release
boundary; treating an existing local `v0.1.3` tag as trustworthy would ignore
the guard; adding new automation or changing artifact names/checksum format
would broaden a documentation/static-contract phase into release behavior.

## Implementation

- `docs/releases/v0.1.3-readiness.md:1` adds copy-pastable local gates,
  final `tag="v0.1.3"` Tag Head Guard commands, downloaded-artifact checksum /
  `examples/fib.ts` / `runtime-prelude-smoke.ts` validation, and the
  `gh release edit v0.1.3 --notes-file docs/releases/v0.1.3.md` notes command.
- `.agents/skills/topaz-release/SKILL.md:102` points final `v0.1.3` operators
  at the readiness checklist before pushing or trusting the final tag, trusting
  final draft assets, or applying final release notes.
- `tests/smoke.sh:565` adds `release_v0_1_3_readiness_contract`, which fails
  if the checklist loses local gate commands, stale-tag stop behavior,
  no-push/no-publish wording, downloaded-artifact validation, notes application,
  or release skill linkage.
- `MEMO.md:366` records Phase 4.33 as release-readiness/static-contract work.

## Consequences

- **Accepted**: final `v0.1.3` operators have a checked-in readiness checklist
  that distinguishes local validation from human-owned tag / release mutation.
- **Accepted**: normal `pnpm test` fails if the checklist or release skill
  linkage loses the stale-tag guard, checksum/fib/runtime-prelude validation,
  notes command, or no-push/no-publish boundary.
- **Rejected**: this phase does not create, delete, move, push, trust, or
  force-move tags; edit or publish GitHub Releases; or change artifact,
  runtime, CLI, manifest, doctor, check, explain, or permission behavior.
- **Regression**: `pnpm run build`, `pnpm test`, and `pnpm run build:release`.
