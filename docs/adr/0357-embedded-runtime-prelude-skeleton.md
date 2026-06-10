# 0357 - embedded runtime prelude skeleton

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.30

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) kept host ABI, raw memory,
exception jumps, and macro-backed containers in C while future pure helpers move
into an internal Topaz runtime prelude. Phase 3.29 then made generated embedded
runtime artifacts checkable in ADR [0356](./0356-runtime-header-freshness-check.md).
Release artifacts are binary-only, so the generated compiler cannot read
`runtime/prelude.ts` from a checkout at compile time.

## Decision

Embed `runtime/prelude.ts` into generated `src/runtime_prelude.ts`, parse that
embedded source as an internal module before user modules, and give it the
stable C module id `runtime_prelude`. The first internal function is the no-op
`__topaz_runtime_prelude_init()`, which is called from `main` immediately after
`topaz_runtime_init_argv(...)` so the lane is visible in generated C without
changing program behavior.

Rejected alternatives: migrating runtime helper behavior now was rejected
because this phase only establishes the lane; exposing `runtime/prelude.ts` as a
stdlib/package import was rejected because it is compiler-owned implementation;
reading the file at generated-compiler runtime was rejected because release
artifacts must remain binary-only; manifest, doctor, capability, release, and
runtime header split work remain separate.

## Implementation

- `runtime/prelude.ts:1` adds the source-of-truth no-op init; `scripts/generate-runtime-prelude.mjs:34`
  renders `src/runtime_prelude.ts`, while `scripts/generate-runtime-prelude.mjs:64`
  implements `--check`.
- `src/ast.ts:656`, `src/topaz_parser.ts:192`, and
  `src/convert_from_tsc.ts:188` add required `SourceModule` metadata with
  normal modules defaulting to `isInternalModule: false` and
  `stableModuleId: ""`; `src/topaz_parser.ts:1965` exposes `parseSource`.
- `src/loader.ts:29` parses the embedded prelude in memory, marks it internal,
  assigns `stableModuleId: "runtime_prelude"`, and prepends it without adding
  it to `ModuleGraph.loaded`.
- `src/codegen.ts:2014` uses stable module ids for C names,
  `src/codegen.ts:2045` hides internal/user function signatures across the
  internal boundary, and `src/codegen.ts:2551` emits the prelude init call at
  the start of `main`.
- `tests/smoke.sh:9` and `scripts/build-release.sh:37` run
  `pnpm run check:runtime-prelude`; `tests/smoke.sh:183` checks the stable C
  symbol and `tests/smoke.sh:342` checks the hidden user-call diagnostic.

## Consequences

- **Accepted**: future helper migrations can lower builtins to stable prelude C
  names and still self-host/distribute as a single compiler binary.
- **Accepted**: normal generated C now includes
  `topaz_fn_runtime_prelude___topaz_runtime_prelude_init`, but runtime behavior
  is unchanged.
- **Rejected**: user code cannot call `__topaz_runtime_prelude_init()` by name.
- **Regression**: `runtime_prelude_embedded` checks emitted C and behavior for
  `examples/fib.ts`; `runtime_prelude_hidden_fail` locks the hidden-name
  diagnostic. `tests/smoke.sh` now has 366 helper invocations plus the dedicated
  prelude C-emission check.
- **Scope outside**: no runtime helper migration, public prelude import API,
  manifest/doctor/capability behavior, release tag, or artifact publication.
