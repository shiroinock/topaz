# 0449 - v0.1.3 RC runtime prelude handoff

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.30

## Context

ADR [0448](./0448-release-runtime-prelude-smoke.md) made
`pnpm run build:release` execute a copied-artifact runtime-prelude fixture, so
the local release path now proves that the native compiler embeds the runtime
TS prelude. The release skill still described downloaded-artifact validation
mostly as checksum plus `examples/fib.ts`, with v0.2 guidance CLI validation as
a later extension. Since `v0.1.3` is the runtime TS prelude checkpoint, future
RC handoffs need the same runtime-prelude black-box check in the downloaded
asset instructions.

## Decision

Document a v0.1.3-specific downloaded-artifact runtime-prelude smoke in
`.agents/skills/topaz-release/SKILL.md`. The temporary
`runtime-prelude-smoke.ts` fixture is independent from `examples/fib.ts` and
uses `String.prototype.slice`, string concatenation,
`String.prototype.charCodeAt`, and `String.prototype.startsWith`, then compiles
with `./topaz-darwin-arm64 runtime-prelude-smoke.ts -o ./runtime-prelude-smoke`
and checks `prelude+check`, `112`, and `true` as stdout. Rejected alternatives:
creating RC tags or publishing assets would be a user-visible external action,
relying on the local release script alone would miss future handoff readers,
and folding this into the v0.2 guidance block would blur the v0.1.3 runtime
checkpoint with later CLI validation.

## Implementation

- `.agents/skills/topaz-release/SKILL.md` adds the v0.1.3 runtime-prelude
  smoke immediately after the generic downloaded binary `fib` validation and
  before the v0.2 guidance CLI extension.
- `tests/smoke.sh` adds `release_skill_runtime_prelude_handoff_contract`, which
  extracts that v0.1.3 block and requires the fixture name, downloaded-artifact
  compile command, migrated helper fragments, and expected stdout.
- `tests/smoke.sh` rejects `examples/fib.ts` inside the v0.1.3
  runtime-prelude handoff block, preserving fib as only the generic binary
  smoke.
- `MEMO.md` records Phase 4.30 as release-readiness documentation and static
  contract work.

## Consequences

- **Accepted**: v0.1.3 RC testers have a copy-pastable downloaded-artifact
  fixture that proves embedded runtime-prelude helper availability.
- **Accepted**: normal `pnpm test` guards the release skill handoff without
  running a release build or requiring downloaded assets.
- **Rejected**: release tags, GitHub Release state, artifact names, checksum
  format, runtime helper implementations, CLI behavior, manifest/check/doctor
  behavior, and permission semantics remain unchanged.
- **Regression**: `pnpm run build` and `pnpm test`.
