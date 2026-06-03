# 0266 - method dispatch diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0265](./0265-console-checked-argument-local.md) advanced the self-host probe
to `src/codegen.ts:8030:30`. The reached blocker was the regular method
dispatch fallback in `emitCall`: after narrowing `callee` to a local
`PropAccessExpr`, the unsupported-receiver diagnostic still passed the full
property-access expression to `CodegenError`. The diagnostic only needs the
property access source position, and the infer-side regular dispatch mirror had
the same larger anchors for unsupported method and value-use diagnostics.

## Decision

Preserve method dispatch behavior and normalize the regular dispatch fallback
diagnostics to explicit property-position anchors. The emit-side fallback and
the infer-side local `prop` dispatch cluster now pass `{ pos: prop.pos }` to
`CodegenError` while keeping all messages, method recognition, return types,
arity checks, and runtime lowering unchanged. Rejected alternatives: broadening
self-host lowering for whole property-access diagnostic anchors was rejected
because these errors only require a source position; adding or removing
supported methods was rejected as a semantic change; sweeping every built-in
method helper was rejected as broader than the reached fallback and its mirror.

## Implementation

- `src/codegen.ts:8030`: the emit-side regular method dispatch fallback now
  anchors unsupported receivers with `{ pos: prop.pos }`.
- `src/codegen.ts:10127`: the infer-side Array unsupported-method fallback now
  uses the same explicit property-position anchor.
- `src/codegen.ts:10143`: `Map.entries()` value-use diagnostics and unsupported
  Map method diagnostics now anchor to `prop.pos`.
- `src/codegen.ts:10160`: `Set.entries()` value-use diagnostics and unsupported
  Set method diagnostics now anchor to `prop.pos`.
- `src/codegen.ts:10171`: class and interface missing-method diagnostics, plus
  the final unsupported-method fallback, now anchor to `prop.pos`.

## Consequences

- **Accepted**: Array, Map, Set, string, class, and interface method dispatch
  keep the existing lowering and inferred return types.
- **Rejected**: unsupported methods remain unsupported, and `Map.entries()` /
  `Set.entries()` remain value-context errors outside supported `for-of`
  lowering.
- **Regression**: no examples were added because observable behavior and
  diagnostic messages/positions are unchanged; build, self-host probe, and
  smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:8030:30` property-access diagnostic
  anchor blocker is removed. The next probe blocker is recorded in the phase
  outcome.
- **Scope out**: broader built-in method diagnostic cleanup remains for later
  phases.
