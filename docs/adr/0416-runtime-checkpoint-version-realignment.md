# 0416 - runtime checkpoint version realignment

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.89

## Context

ADR [0415](./0415-runtime-prelude-release-checkpoint.md) named `v0.1.2` as the
runtime TS prelude checkpoint before checking the already-published release
state. The public GitHub Release and tag `v0.1.2` already exist, are not draft
or prerelease history, and point at older commit
`7de476fc62ac943857ae0d4d918405c54a6e5ba2` from phase 3.60 rather than the
current runtime prelude / intrinsic-family / pinned-substrate checkpoint.

Topaz release intent remains tag-driven, and published public release history
should be treated as immutable. The current checkpoint still needs a clear
release vehicle so the roadmap, migration docs, and release skill do not tell a
future release worker to reuse a tag that already means something else.

## Decision

Supersede ADR 0415's version allocation and make `v0.1.3` the next release
vehicle for the current runtime TS prelude checkpoint. `v0.1.2` remains the
already-published runtime prelude start / string-buffer boundary / substrate
freshness release at phase 3.60, while `v0.1.3` carries the current checkpoint:
hidden prelude symbols and migrated helpers, `StringBuffer` / `BigIntBuffer`
intrinsic substrate families, closed legacy lanes, and pinned pre-v0.2 C
substrate boundaries. Rejected alternatives: retagging `v0.1.2` was rejected
because it would rewrite public release meaning; deleting or recreating the
remote tag / GitHub Release was rejected because it is public history;
force-pushing was rejected for the same reason; editing published `v0.1.2`
release notes to describe current HEAD was rejected because the tag points at
older code.

## Implementation

- `MEMO.md` records Phase 3.89 and splits the release allocation between the
  already-published `v0.1.2` release and the next checkpoint vehicle `v0.1.3`.
- `docs/runtime-ts-migration.md` removes `v0.1.2` wording from the Phase 3.88
  checkpoint section and adds the Phase 3.89 release-version realignment note.
- `.agents/skills/topaz-release/SKILL.md` updates the version policy so future
  release work treats `v0.1.2` as immutable and `v0.1.3` as the runtime TS
  prelude checkpoint.
- `docs/adr/0415-runtime-prelude-release-checkpoint.md` is marked superseded by
  this ADR.

## Consequences

- **Accepted**: future runtime checkpoint release work should use `v0.1.3`
  unless a later ADR changes the allocation.
- **Accepted**: the published `v0.1.2` tag and GitHub Release remain untouched.
- **Rejected**: this phase does not retag, delete tags, force-push, edit GitHub
  Release notes or assets, change `package.json`, create release tags, or
  expand public language/runtime semantics.
- **Regression**: documentation-only realignment; gates are `pnpm run build`,
  `pnpm run check:runtime-substrate`, and `pnpm test`.
- **Scope外**: runtime behavior, generated runtime/codegen files,
  `runtime/runtime.h`, `runtime/prelude.ts`, public API, release tags, and
  GitHub Releases are unchanged.
