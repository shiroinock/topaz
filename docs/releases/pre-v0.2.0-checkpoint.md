# pre-v0.2.0 transition checkpoint

This checkpoint marks the repo-local handoff from the `v0.1.3` runtime TS
prelude release-readiness track to the `v0.2.0` capability guidance release
track.

v0.1.3 is the runtime TS prelude checkpoint. It still requires explicit
human-owned release-state action before anyone trusts a final tag or GitHub
Release, because the local final tag may be stale. Stale final tag handling is
covered by `docs/releases/v0.1.3-release-state-handoff.md`.

## Readiness Evidence

Repo-local readiness now includes:

- `pnpm run build`
- `pnpm test`
- `pnpm run build:release`
- runtime header freshness
- runtime prelude freshness
- runtime substrate inventory
- copied-artifact and downloaded-artifact style runtime-prelude smoke
- checked-in `docs/releases/v0.1.3.md`
- checked-in `docs/releases/v0.1.3-readiness.md`

## Runtime Boundary

The pre-v0.2.0 runtime boundary is intentionally not "move every remaining C
helper to TS". The remaining C surface is the pinned substrate/intrinsic family
boundary:

- `libc-libm-boundary: 3`
- `host-abi-boundary: 12`
- `raw-memory-boundary: 3`
- `exception-boundary: 4`
- `c-abi-type-boundary: 8`
- `container-monomorph-boundary: 13`
- `string-buffer-intrinsic-family: 5`
- `bigint-limb-intrinsic-family: 8`

## v0.2.0 Starting Surface

`v0.2.0` should start from the existing guidance surface rather than runtime
migration:

- `topaz doctor <entry.ts>`
- `topaz manifest init <entry.ts>`
- `topaz manifest init --write <entry.ts>`
- `topaz check <entry.ts>`
- `topaz explain capability <name>`
- `topaz explain std/<module>`

## Out Of Scope

Future work after this checkpoint remains outside this phase: compile-time policy enforcement,
runtime sandboxing, schema expansion, richer policy discovery, release tag
mutation, GitHub Release edits, and publication.
