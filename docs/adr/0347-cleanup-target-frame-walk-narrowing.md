# 0347 - cleanup target frame walk narrowing

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.19

## Context

After [0346](./0346-split-loop-body-query-cases.md), the self-host gate
advanced to `src/codegen.ts:7843:15` in `targetEscapesCleanupContext`. The
cleanup target lookup walked `context.loopBoundary` with a single loop cursor
typed as `LoopCtxFrame | undefined`, then read `.prev` after a
`while (frame !== undefined)` guard. Topaz does not preserve that proof across
the cursor update strongly enough for the self-host source.

## Decision

Split the cleanup target walk into an explicitly optional cursor and a narrowed
frame local before reading `.prev`. The loop now records the next optional
frame in a separate local and updates the cursor after the narrowed branch, so
the linked-frame traversal and target comparison stay unchanged. Rejected
alternatives: adding loop-variable narrowing semantics was rejected as broader
than this self-host blocker; changing cleanup labels, loop context ownership,
or break/continue dispatch was rejected because this phase only rewrites the
helper source shape.

## Implementation

- `src/codegen.ts:7840` declares the cleanup walk cursor as
  `LoopCtxFrame | undefined`.
- `src/codegen.ts:7848` binds the non-undefined cursor branch to a local
  `frame` before comparing against `target`.
- `src/codegen.ts:7850` reads `frame.prev` from that narrowed local and stores
  it in an optional next-cursor local before the cursor update.
- No runtime, try/finally lowering, cleanup labels, loop ownership, or
  diagnostics changed.

## Consequences

- **Accepted**: the old `src/codegen.ts:7843:15` cleanup target frame walk
  blocker is cleared without changing break/continue cleanup semantics.
- **Accepted**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:9612:24`, where `Array.push` spread lowering calls
  `fixedTmps.length.toString()` and Topaz does not support
  `number.toString()`.
- **Rejected**: broader loop-variable narrowing and the next self-host blocker
  remain out of scope.
- **Regression**: no standalone sample was added because this is a
  compiler-source cleanup. Existing `try_finally_break_continue`,
  `try_catch_finally_break_fail`, full smoke coverage, and the self-host probe
  remain the regression surface.
