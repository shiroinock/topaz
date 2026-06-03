# 0198. resolveGenericCall minimal anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0197](./0197-generic-lookup-presence-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4795:11`, where `resolveGenericCall` passed
the full `CallExpr` into diagnostic and annotation-helper positions. Those
sites only need the call position, and exact anonymous object identity rejected
the wider `CallExpr` shape. [0172](./0172-type-annotation-minimal-anchors.md)
and [0190](./0190-captured-identifier-minimal-anchor.md) already established
local minimal anchors as the preferred cleanup for this class of blocker.

## Decision

Create a local `callAnchor: { pos: number }` inside `resolveGenericCall` and use
it for generic-call diagnostics, explicit type-argument annotation parents, and
generic inference unification anchors. Keep indexed type-argument and argument
reads, generic inference semantics, monomorph naming, and worklist behavior
unchanged.

Rejected alternatives: broadening anonymous object assignability would change
the language subset; widening `CodegenError`, `typeFromAnnotation`, or
`unifyTypeParam` would weaken their diagnostic-anchor contracts; rewriting
generic inference would cross this phase's fixed scope.

## Implementation

- `src/codegen.ts:4789` creates `callAnchor` once after resolving the generic
  function metadata.
- `src/codegen.ts:4795` through `src/codegen.ts:4805` use `callAnchor` for
  explicit type-argument arity diagnostics and the `typeFromAnnotation` parent
  anchor.
- `src/codegen.ts:4815` through `src/codegen.ts:4830` use `callAnchor` for
  inference arity diagnostics, `unifyTypeParam`, and missing-inference
  diagnostics.

## Consequences

- **Accepted**: diagnostics remain anchored at the generic call site.
- **Rejected**: no object assignability, generic inference, or generic syntax
  behavior changed.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus the existing smoke
  suite.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4795:11` exact-object mismatch and now
  stops at `src/codegen.ts:4805:43` with `non-null assertion (\`!\`) requires a
  \`T | undefined\` operand`.
