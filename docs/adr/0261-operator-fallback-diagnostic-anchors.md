# 0261 - operator fallback diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0260](./0260-string-literal-text-call-anchors.md) advanced the self-host probe
to `src/codegen.ts:7857:28`. The operator helper fallback path still passed full
operator expression objects to `unsupported`, but the diagnostic helper only
needs an expression kind and source position. Under exact structural matching,
`PrefixOpExpr` and the small helper anchor are intentionally different shapes.

## Decision

Preserve operator lowering and type checking, but normalize operator fallback
diagnostics to explicit minimal anchors: `{ kind: expr.kind, pos: expr.pos }`
for `unsupported` and `{ pos: expr.pos }` for the emit-side loose equality
`CodegenError`. Rejected alternatives: broadening `unsupported` to accept every
full operator AST shape was rejected because the helper contract is already
smaller; adding new operator support was rejected as unrelated to this
self-host cleanup; sweeping unrelated method-call or value diagnostics was
rejected as too broad for the reached blocker.

## Implementation

- `src/codegen.ts:7857`: `prefixOp` unsupported operators now pass the small
  `{ kind, pos }` anchor.
- `src/codegen.ts:7865`: `postfixOp` uses the same small fallback anchor.
- `src/codegen.ts:7881`: `assignOp` fallback diagnostics no longer pass the
  full assignment expression.
- `src/codegen.ts:7902`: emit-side loose equality rejection reports through a
  `{ pos }` anchor while keeping the same message and rejection policy.
- `src/codegen.ts:7904`: `binaryOp` unsupported operator fallback uses the
  small anchor.
- `src/codegen.ts:9799` and `src/codegen.ts:9964`: infer-side prefix and binary
  fallback paths use the same `{ kind, pos }` pattern.

## Consequences

- **Accepted**: existing supported prefix, postfix, assignment, binary, strict
  equality, and logical operators keep the same lowering and inference.
- **Rejected**: loose equality remains unsupported, and no new operator syntax
  is accepted.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7857:28` anchor-shape blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader diagnostic-anchor cleanup outside operator fallback
  paths remains for later phases.
