# 0038. Scope linked frames (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0037](./0037-non-root-module-globals.md) moved the full graph self-host probe
past non-root module-global validation. The next blocker was
`src/codegen.ts:627:18`: `Scope` used `Map<string, Binding>[]` and
`Map<string, TopazType>[]`, which require `Array<Map<...>>`. Nested containers
remain outside the Topaz subset and are not needed as a user-visible feature for
this step.

## Decision

Rewrite `Scope` to use linked `ScopeFrame` objects instead of parallel arrays
of maps. Each frame owns its binding map, narrowing map, parent pointer, and
depth. Scope barriers store the minimum visible depth, preserving the old
arrow-body behavior without requiring an array of maps.

Rejected alternatives: adding general nested-container support would broaden
the language for one compiler-internal data structure; replacing the maps with
parallel scalar arrays would make lookup and narrowing behavior harder to
reason about; removing barriers would regress arrow capture isolation.

## Implementation

- `src/codegen.ts:578` adds `ScopeFrame` with `bindings`, `narrowings`,
  `parent`, and `depth`.
- `src/codegen.ts:633` changes `Scope` to hold the current frame and a scalar
  `barrierDepths` stack.
- `src/codegen.ts:645` rewrites `push`/`pop` to move along linked frames.
- `src/codegen.ts:658` preserves arrow capture barriers by storing
  `current.depth + 1` as the lookup floor.
- `src/codegen.ts:677`, `src/codegen.ts:700`, and `src/codegen.ts:725` rewrite
  `lookup`, `lookupBase`, and `lookupAcrossBarrier` to walk parent links while
  preserving narrowing precedence.

## Consequences

- **Accepted**: lexical scope lookup, base lookup, narrowing overlays, and arrow
  capture barrier behavior are preserved without `Array<Map<...>>`.
- **Rejected**: general nested-container support in this substep.
- **Regression**: no new example was added because this is source-only compiler
  cleanup; existing narrowing, closure, and arrow capture regressions continue
  to cover behavior. Full `pnpm test` passes.
- **Next blocker**: the old `Scope` nested-container blocker is gone. The full
  graph probe now reaches `src/codegen.ts:928:20` and stops on
  `Array<"loop" | "switch">` for `loopCtx`.
