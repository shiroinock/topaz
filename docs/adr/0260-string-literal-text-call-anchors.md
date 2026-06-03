# 0260 - string literal text call anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0259](./0259-template-concat-accumulator-closure-cleanup.md) advanced the
self-host probe to `src/codegen.ts:7830:81`. `emitStringLiteralText` already
takes a narrow `{ pos: number }` diagnostic anchor, but template literal
fragments and the expected string-literal path still passed full expression
objects to that helper or to its adjacent mismatch diagnostic.

## Decision

Preserve string and template literal semantics and normalize the remaining
string-literal text call anchors to explicit `{ pos }` objects. Rejected
alternatives: broadening `emitStringLiteralText` to accept full expressions was
rejected because the helper only needs a source position; changing literal
escaping, ASCII rejection, byte-length handling, or template concat order was
rejected as unrelated behavior work; sweeping unrelated `CodegenError(expr, ...)`
sites was rejected as too broad for this self-host blocker.

## Implementation

- `src/codegen.ts:7830`: template literal heads now call
  `emitStringLiteralText` with `{ pos: expr.pos }`.
- `src/codegen.ts:7835`: cooked template tails use the same explicit source
  position anchor.
- `src/codegen.ts:10501`: expected string-literal mismatches report through an
  explicit `{ pos: expr.pos }` anchor.
- `src/codegen.ts:10507`: matching expected string literals emit through the
  same narrow anchor contract.

## Consequences

- **Accepted**: plain string literals, no-substitution template literals, and
  template head/tail fragments keep the same C lowering.
- **Rejected**: non-ASCII contents remain unsupported, and no new template
  substitution or string literal syntax is accepted.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7830:81` anchor-shape blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader diagnostic-anchor cleanup and string runtime behavior
  changes remain outside this phase.
