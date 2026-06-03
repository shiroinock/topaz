# 0183. loop context pop local narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0182](./0182-fn-wrapper-signature-explicit-params-tail.md) moved the full graph
self-host probe to `src/codegen.ts:4143:22`, where `popLoopCtx` checked
`this.loopCtx !== undefined` and then reread `this.loopCtx.prev`. Topaz narrows
locals reliably, but repeated optional property reads remain broader type-system
work. [0039](./0039-loop-context-linked-frames.md) intentionally changed loop
context to linked frames, so the fix should preserve that representation.

## Decision

Use a local snapshot in `popLoopCtx`: read `this.loopCtx` into `top`, narrow
`top !== undefined`, and then assign `this.loopCtx = top.prev`. Empty pops stay
as no-ops, and loop context remains a linked frame stack.

Rejected alternatives: adding repeated optional property-read narrowing would
expand the checker for one compiler-source cleanup; restoring an array stack
would undo ADR 0039 and reintroduce the old subset-hostile container shape;
throwing on empty pop would change the existing balanced-emission convention.

## Implementation

- `src/codegen.ts:4141` keeps `popLoopCtx` as the single pop helper for loop and
  switch emission paths.
- `src/codegen.ts:4142` stores the current frame in local `top`, making the
  undefined check narrow the value used for `.prev`.
- `src/codegen.ts:4144` assigns `top.prev` only in the present branch, preserving
  no-op behavior when the linked stack is empty.

## Consequences

- **Accepted**: non-empty loop context pops advance to the previous linked
  frame.
- **Accepted**: empty loop context pops remain unchanged.
- **Rejected**: no optional property-read narrowing rule or loop context
  representation change was added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4143:22` `.prev` blocker and now stops
  at `src/codegen.ts:4249:33` because `new Set(params.map((p) => p.name))`
  passes constructor arguments, which remain unsupported.
