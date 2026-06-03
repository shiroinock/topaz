# 0221. declaration diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0220](./0220-declare-binding-minimal-anchors.md) moved the full-graph
self-host probe to `src/codegen.ts:5864:33`, where `tryEmitModuleGlobalDecl`
passed a full variable declaration node into `assertNotVoid`. The neighboring
declaration helpers still had the same subset-hostile pattern: diagnostics and
annotation helpers receiving full declaration nodes when their contracts only
need a source position.

This phase is compiler-source cleanup only. Module globals, object
destructuring, variable declarations, initializer inference, dunion initializer
narrowing, and generated C should keep their current behavior.

## Decision

Normalize declaration diagnostics in the module-global, object-destructuring,
and plain variable declaration helper cluster to local `{ pos }` anchors.
Annotation resolution remains anchored on the annotation position, while
declaration and initializer diagnostics use declaration-, initializer-, or
binding-local positions that match the existing diagnostic ownership.

Rejected alternatives: broadening anonymous object assignability was rejected
because it would change subset semantics; changing `assertNotVoid`,
`typeFromAnnotation`, or `CodegenError` contracts was rejected because those
helpers already accept minimal anchors; sweeping unrelated declaration and
loop diagnostics was rejected as outside this phase's ownership.

## Implementation

- `src/codegen.ts:5862-5866` keeps module-global annotation resolution on a
  type-local anchor and passes a declaration-local anchor to `assertNotVoid`.
- `src/codegen.ts:5937-6011` derives object-destructuring anchors for the
  declaration, initializer, and per-binding diagnostics before invoking
  `CodegenError` or `assertNotVoid`.
- `src/codegen.ts:6044-6101` replaces declaration optional truthiness with
  explicit `undefined` checks, anchors annotation resolution on the annotation,
  and passes declaration-local anchors to variable `assertNotVoid` checks.

## Consequences

- **Accepted**: declaration diagnostics remain source-positioned with the same
  messages.
- **Accepted**: declaration semantics, narrowing, module global lowering,
  destructuring lowering, and generated C are unchanged.
- **Rejected**: anonymous object assignability and unrelated diagnostic anchors
  remain unchanged.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing module global, destructuring, variable declaration,
  dunion narrowing, and full smoke coverage. `tests/smoke.sh` still contains
  280 cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5864:33` `assertNotVoid` mismatch and
  now stops at `src/codegen.ts:5874:39`: cannot access `.init` on the `Stmt`
  discriminated union before narrowing.
