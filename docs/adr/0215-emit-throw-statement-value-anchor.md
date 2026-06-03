# 0215. emitThrowStatement value minimal anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0214](./0214-emit-statement-unsupported-minimal-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:5487:9`, where `emitThrowStatement` passed
the full thrown `Expr` union to a `CodegenError` diagnostic. The diagnostic
contract only needs `{ pos: number }`, and exact anonymous object matching
rejects the richer expression union shape.

Existing minimal-anchor cleanups, including
[0172](./0172-type-annotation-minimal-anchors.md),
[0210](./0210-emit-statement-return-minimal-anchors.md), and
[0214](./0214-emit-statement-unsupported-minimal-anchor.md), established local
minimal diagnostic anchors as the preferred compiler-source cleanup.

## Decision

Create a local `valueAnchor: { pos: number }` from `stmt.value.pos` inside
`emitThrowStatement`, then use it only for the non-class throw value diagnostic.
Throw type checking and lowering continue to use the original `stmt.value`.

Rejected alternatives: broadening `CodegenError` anchor assignability was
rejected because exact anonymous object matching must remain a self-hosting
constraint. Adding support for non-class throw values was rejected because this
phase only cleans up diagnostic anchor shape. Sweeping unrelated expression
diagnostics was rejected as outside the fixed brief.

## Implementation

- `src/codegen.ts:5485` creates the minimal `{ pos: number }` anchor from the
  thrown expression position.
- `src/codegen.ts:5487-5490` passes that anchor to the existing non-class
  throw value `CodegenError`.
- `src/codegen.ts:5492` keeps the existing `topaz_throw(...)` emission
  unchanged.

## Consequences

- **Accepted**: throw value diagnostics remain anchored at the thrown
  expression.
- **Accepted**: self-hosting progresses without changing throw semantics or
  successful throw lowering.
- **Rejected**: `CodegenError` remains narrow, and non-class throw values stay
  unsupported.
- **Regression**: no new example was added because this is compiler-source
  cleanup with no user-visible behavior change; existing throw/catch smoke
  cases and the full self-host probe cover it.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5487:9` exact-object mismatch and now
  stops at `src/codegen.ts:5509:9` with `type mismatch: expected
  topaz_boolean, got topaz_union_class_anon_36_or_undefined`.
