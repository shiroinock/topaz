# 0467 - post-v0.2 TypeScript compatibility priorities

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.0

## Context

`v0.2.0` shipped the guidance surface: `doctor`, `manifest init`, `check`, and
`explain`. After that release, the next product question is not whether normal
zero-config compile should keep working, but which user-visible TypeScript
compatibility gaps should be improved first. ADR [0327](./0327-fiber-async-await-design.md)
already fixed the first async design, but it intentionally rejected thenable
assimilation and most Promise method surface. Separately, common TypeScript
codebases use branded / opaque / nominal-ish patterns built from intersections,
phantom properties, and `unique symbol` even when those constructs erase at
runtime.

## Decision

Prioritize TypeScript syntax and type-pattern compatibility ahead of the v0.2
policy-enforcement follow-through. The next two tracks are:

1. async/await compatibility, staged from `Promise<T>` MVP through async
   function lowering, `await`, async arrow, async method, Promise methods,
   explicit `PromiseLike` bridging, and controlled static thenable assimilation;
2. branded / brand / opaque / nominal / `unique symbol` compatibility, starting
   with erasable type-only patterns that do not add runtime objects.

Async keeps two scheduler stories separate: a Node-compatible single-thread
microtask scheduler for migration and ordering tests, and a future Topaz-owned
parallel scheduler mode for opt-in / effect-safe CPU task execution. The latter
is aspirational and must not imply that `async` automatically means parallelism.

Rejected alternatives: continuing immediately with compile-time manifest
enforcement would improve v0.2 policy depth but not TypeScript coverage;
starting with RegExp or generic methods would be valuable but less aligned with
the current async/brand discussion; implementing runtime-emitting `enum`
compatibility first was rejected because modern TypeScript migration pressure is
better served by erasable syntax and type-only nominal patterns.

## Implementation

- `MEMO.md:381` records Phase 5.0 as the post-v0.2 compatibility priority
  reset.
- `MEMO.md:391` realigns release/version allocation so v0.3 targets async
  compatibility and v0.4 targets branded / opaque / nominal / `unique symbol`
  compatibility before RegExp, generic methods, and remaining BigInt.
- `MEMO.md:401` moves Post-MVP ecosystem items toward the async roadmap and
  brand-pattern compatibility while leaving v0.2 policy enforcement as future
  work.
- `tests/smoke.sh:869` adds a static roadmap contract so ordinary smoke catches
  drift in these priorities.

## Consequences

- **Accepted**: async work should improve compatibility in stages rather than
  stop at nominal `Promise<T>`; Node-compatible ordering and Topaz parallel task
  execution are separate modes.
- **Accepted**: brand / opaque / nominal / `unique symbol` support starts with
  erasable type-only TS patterns, not runtime object semantics.
- **Rejected**: `enum` compatibility stays low priority; keep clear
  rejects until a later migration audit proves it is worth implementing.
- **Regression**: `phase_5_0_typescript_compatibility_priority_contract` static
  smoke contract.
- **Scope out**: no parser, codegen, runtime, manifest enforcement, release
  state, or public CLI behavior changes are implemented in this phase.
