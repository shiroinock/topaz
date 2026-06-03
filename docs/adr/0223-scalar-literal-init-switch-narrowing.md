# 0223. scalar literal init switch narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0222](./0222-module-init-for-statement-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:5925:17`, where `tryScalarLiteralInit`
tested `expr.kind === "prefix_op"` and `expr.operand.kind === "num_lit"` in an
`if` condition before reading `expr.operand.text`. The compiler-source subset
requires discriminated-union fields to be read after a `switch (x.kind)`
narrowing step.

The helper is only source normalization for module const scalar literal
hoisting. It should not change accepted initializer forms or generated C.

## Decision

Rewrite `tryScalarLiteralInit` as a `switch (expr.kind)` recognizer and use a
nested `switch (operand.kind)` before reading prefix operand fields. Keep the
same numeric literal spelling, `.0` suffixing through `hasDecimalOrExponent`,
boolean spelling, and `undefined` result for non-scalar initializer forms.

Rejected alternatives: broadening discriminated-union field access was rejected
as type-system scope; adding new scalar initializer forms such as strings or
container literals was rejected as module const hoist scope; sweeping other
`if (expr.kind === ...)` sites was rejected as outside this phase.

## Implementation

- `src/codegen.ts:5913-5935` now switches on `expr.kind` for numeric, boolean,
  and prefix operator cases while preserving the returned `{ type, cExpr }`
  values.
- `src/codegen.ts:5923-5932` binds `expr.operand` to a local and switches on
  `operand.kind` before reading `operand.text`.
- Case bodies use direct returns instead of block-only bodies so the existing
  self-host subset's switch fall-through check can verify each case terminates.

## Consequences

- **Accepted**: numeric literals, boolean literals, and unary `+` / `-` numeric
  literals remain hoistable as module const scalar initializers.
- **Accepted**: number formatting and generated C for successful programs are
  unchanged.
- **Rejected**: no new narrowing rule, hoistable initializer form, or broader
  expression emitter cleanup is introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing module const hoist and full smoke coverage.
  `tests/smoke.sh` coverage remains 281 case invocations.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5925:17` `.text` access blocker and now
  stops at `src/codegen.ts:5976:5`: variable declaration must have an
  initializer in `emitObjectDestructuringDecl`.
