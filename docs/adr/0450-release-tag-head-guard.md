# 0450 - release tag head guard

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.31

## Context

The `v0.1.3` release-readiness sequence can add commits after an RC or final
tag already exists locally. A clean working tree and green local gates are not
enough if the tag that triggers GitHub Actions still peels to an older commit:
the workflow would build and draft assets for stale source while the operator
is looking at current `HEAD`. ADR [0449](./0449-v0-1-3-rc-runtime-prelude-handoff.md)
strengthened downloaded-artifact validation, but the release runbook still
needed an explicit tag-vs-HEAD guard before tag push or draft Release trust.

## Decision

Make `.agents/skills/topaz-release/SKILL.md` require a Tag Head Guard before
creating, pushing, or trusting any release tag or draft Release. The guard sets
the intended `tag`, records `git rev-parse HEAD`, checks an existing tag with
`git rev-parse "${tag}^{commit}"`, and stops if the peeled tag commit differs
from `HEAD`. Rejected alternatives: deleting or moving tags in this phase is
destructive, inspecting GitHub Releases is unnecessary for the repo-local
procedure, automatically choosing a new version number remains outside the
operator-owned version decision, and changing Actions release behavior would
broaden a static runbook contract into release automation.

## Implementation

- `.agents/skills/topaz-release/SKILL.md` adds a `Tag Head Guard` section after
  preflight, including copy-pastable commands for `git rev-parse HEAD` and
  `git rev-parse "${tag}^{commit}"`.
- `.agents/skills/topaz-release/SKILL.md` routes both the RC flow and final
  release flow through that guard before tag push or draft Release trust.
- `tests/smoke.sh` adds `release_tag_head_guard_contract`, which fails normal
  `pnpm test` if the guard label, rev-parse commands, stale-tag stop wording,
  stale-push prohibition, remote force-move/delete prohibition, or new-RC /
  explicit-approval wording disappears.
- `MEMO.md` records Phase 4.31 as release procedure and static-contract work.

## Consequences

- **Accepted**: existing tags are safe only when their peeled commit is the
  intended release `HEAD`.
- **Accepted**: absent tags are created as annotated tags at current `HEAD`.
- **Rejected**: this phase does not create, delete, move, force-push, inspect
  remote release state, publish, or choose a version number.
- **Regression**: `pnpm run build` and `pnpm test`.
