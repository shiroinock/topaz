# 0451 - v0.1.3 release notes draft

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.32

## Context

The release workflow creates draft GitHub Release notes with a placeholder
body. ADR [0449](./0449-v0-1-3-rc-runtime-prelude-handoff.md) fixed the
downloaded-artifact runtime-prelude validation fixture, and ADR
[0450](./0450-release-tag-head-guard.md) made tag trust explicit, but final
`v0.1.3` publication still needed reviewed, structured notes that can be
applied without deciding to mutate external release state during this phase.

## Decision

Add a checked-in final release notes draft at `docs/releases/v0.1.3.md`, point
the release skill at it, and guard the notes with a normal `pnpm test` static
contract. Rejected alternatives: editing the GitHub Release now would perform
an external release operation before the user asks; creating, deleting, moving,
or pushing tags would cross the Phase 4.31 explicit tag boundary; keeping only
a generic release-note template would lose the concrete runtime TS prelude
checkpoint meaning; generating notes from `git log` would list phase commits
rather than release themes; changing artifact, checksum, CLI, runtime,
manifest, doctor, check, explain, or permission behavior is outside this
release-readiness documentation phase.

## Implementation

- `docs/releases/v0.1.3.md:1` adds structured final notes with `## Changes`,
  `## Assets`, `## Verification`, and `## Notes`.
- `.agents/skills/topaz-release/SKILL.md:95` records that `v0.1.3` notes are
  prepared at `docs/releases/v0.1.3.md` and can be applied with
  `gh release edit v0.1.3 --notes-file docs/releases/v0.1.3.md` after
  asset/checksum/black-box validation passes.
- `.agents/skills/topaz-release/SKILL.md:257` routes final `v0.1.3`
  validation through the runtime-prelude smoke before publishing.
- `tests/smoke.sh:524` adds `release_v0_1_3_notes_contract` to require the
  notes file, section headings, checksum and `examples/fib.ts` commands,
  `runtime-prelude-smoke.ts` commands and expected output, the no-public-surface
  note, absence of the workflow placeholder, and release skill linkage.
- `MEMO.md:365` records Phase 4.32 as repo-local release-notes/static-contract
  work.

## Consequences

- **Accepted**: final `v0.1.3` release notes can be reviewed and applied from a
  repo-local file after validation passes.
- **Accepted**: normal `pnpm test` fails if the notes lose required structure,
  verification commands, runtime-prelude fixture evidence, no-surface-expansion
  wording, or release skill linkage.
- **Rejected**: this phase does not create, delete, move, push, or trust tags,
  edit GitHub Releases, change artifact behavior, or change runtime / CLI /
  guidance behavior.
- **Regression**: `pnpm run build` and `pnpm test`.
