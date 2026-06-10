# 0415 - runtime prelude release checkpoint

- **Status**: Superseded by [0416](./0416-runtime-checkpoint-version-realignment.md)
- **Date**: 2026-06-11
- **Phase**: 3.88

## Context

Phases 3.15 through 3.87 turned the runtime TS migration from a broad idea into
an implemented internal prelude lane plus explicitly classified C substrate.
ADR [0355](./0355-runtime-ts-prelude-boundary.md) set the boundary between pure
helpers and tiny C substrate, ADR
[0357](./0357-embedded-runtime-prelude-skeleton.md) embedded the internal
prelude before user modules, ADRs [0358](./0358-runtime-prelude-starts-with.md)
through [0405](./0405-bigint-decimal-formatting-prelude.md) migrated concrete
string, path, parse, and BigInt helpers, and ADRs
[0408](./0408-libc-libm-number-substrate-policy.md) through
[0414](./0414-active-intrinsic-family-substrate-policy.md) pinned the remaining
pre-v0.2 C substrate families and boundaries. The release roadmap still
described v0.1.2 as future groundwork / first pure helper migration, which no
longer matched the implemented state.

## Decision

Treat v0.1.2 as the runtime TS prelude checkpoint for the MVP line: internal
runtime prelude injection and embedding exist, stable hidden prelude symbols are
used for migrated pure helpers, `StringBuffer` and `BigIntBuffer` intrinsic
families are active compiler-owned internal substrate, and the remaining C
runtime surface is explicitly pinned before v0.2.0. This is an internal runtime
architecture checkpoint, not a public TS/JS compatibility expansion. Rejected
alternatives: starting an RC tag or GitHub Release from this docs phase was
rejected because release intent remains tag-driven and separate; changing
`package.json` version semantics was rejected because npm publication metadata
is not the version policy source; describing v0.1.2 as the old "first helper"
work was rejected because the prelude lane has already migrated multiple helper
families and classified the remaining substrate.

## Implementation

- `MEMO.md:329` records Phase 3.88 as a docs/release-roadmap checkpoint with no
  language, runtime, package version, or release tag change.
- `MEMO.md:335` updates the v0.1.2 allocation from future groundwork to the
  current runtime TS prelude checkpoint.
- `docs/runtime-ts-migration.md:234` adds the Phase 3.88 checkpoint section after
  the Phase 3.87 active intrinsic-family policy.
- `.agents/skills/topaz-release/SKILL.md:19` names v0.1.2 as the runtime TS
  prelude checkpoint while keeping patch and tag-driven release guidance
  unchanged.

## Consequences

- **Accepted**: release notes and roadmap can describe the runtime internals
  honestly: prelude injection, hidden migrated helper symbols, active intrinsic
  substrate families, and pinned C substrate boundaries.
- **Accepted**: future runtime shrink work needs explicit ADRs for each pinned
  substrate family or backend boundary instead of inheriting a generic "move
  every `runtime.h` helper" mandate.
- **Rejected**: this phase creates no release tag, edits no GitHub Release,
  changes no runtime behavior, changes no generated runtime/codegen files, and
  expands no public language or runtime semantics.
- **Regression**: documentation-only checkpoint; gates are `pnpm run build`,
  `pnpm run check:runtime-substrate`, and `pnpm test`.
- **Scope外**: `runtime/runtime.h`, `runtime/prelude.ts`,
  `src/runtime_header.ts`, `src/runtime_prelude.ts`, `src/codegen.ts`,
  `package.json`, release tags, and public APIs are unchanged.
