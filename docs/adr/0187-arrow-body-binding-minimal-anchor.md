# 0187. Arrow body binding minimal anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0186](./0186-arrow-emission-restore-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4288:70`, where `emitArrowFunction` declared
arrow body parameters by passing the full `ArrowExpr` object to
`scope.declareBinding`. Earlier minimal-anchor cleanups, including
[0172](./0172-type-annotation-minimal-anchors.md), established that compiler
source should pass only the diagnostic shape required by helper APIs when the
full AST node is not semantically needed.

## Decision

Declare arrow body parameters with a local `{ pos: arrow.pos }` anchor and pass
that minimal anchor to `scope.declareBinding`. This preserves the arrow
expression as the diagnostic position while avoiding object assignability
between unrelated compiler-source AST shapes.

Rejected alternatives: broadening `declareBinding` would weaken the
minimal-anchor cleanup direction; reusing a parameter-specific anchor would
move diagnostics away from the arrow binding site; changing arrow scope or
capture setup is unnecessary because the blocker is only the anchor shape.

## Implementation

- `src/codegen.ts:4285` still pushes the arrow emission barrier and inner scope
  before parameter binding.
- `src/codegen.ts:4287` creates `arrowAnchor` as the minimal `{ pos: number }`
  object from `arrow.pos`.
- `src/codegen.ts:4289` passes `arrowAnchor` to `scope.declareBinding` while
  preserving each parameter name, type, constness, scope order, and later state
  restoration.

## Consequences

- **Accepted**: arrow body parameter declarations keep their existing scope,
  names, types, constness, and arrow-position diagnostic anchor.
- **Rejected**: no object assignability, arrow parameter typing, capture
  semantics, or scope setup rules changed.
- **Regression**: no example was added because this compiler-source cleanup is
  covered by the full graph self-host probe plus the existing 277 smoke checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4288:70` `expected topaz_class_anon_88,
  got topaz_class_anon_30` blocker and now stops at `src/codegen.ts:4291:5`
  with `variable declaration must have an initializer`.
