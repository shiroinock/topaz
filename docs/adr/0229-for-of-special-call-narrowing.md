# 0229. for-of special call narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0228](./0228-emit-for-statement-body-block-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:6252:8`, where the Map / Set for-of special
form detector read `source.optional`, `source.callee.kind`, and
`source.callee.optional` inside one compound condition. The runtime behavior was
already correct, but the self-host subset requires the outer call expression and
then the property callee expression to be explicitly narrowed before accessing
variant-specific fields.

This is a compiler-source cleanup for the existing `.values()`, `.keys()`, and
`.entries()` syntactic special forms in `emitForOfStatement`.

## Decision

Rewrite only the Map / Set for-of special-form detector to nested explicit
expression narrowing: first bind `source` as a non-optional `call_expr`, then
bind its `callee` as a non-optional `prop_access`, then run the existing method
dispatch and hash lowering. Optional calls and optional property accesses still
fall through to the normal for-of path.

Rejected alternatives: broadening discriminated-union property access was
rejected as language-semantics scope; changing optional call/property behavior
was rejected because this phase is source normalization only; refactoring hash
or iterator lowering was rejected because the existing generated C and
diagnostics should remain unchanged.

## Implementation

- `src/codegen.ts:6247-6321` now narrows `stmt.source` with
  `source.kind === "call_expr"`, checks `callExpr.optional === false`, binds
  `callExpr.callee`, and then checks
  `callee.kind === "prop_access" && callee.optional === false` before reading
  `callee.name` or `callee.receiver`.
- `src/codegen.ts:6257-6294` preserves the existing argument-count and
  binding-shape diagnostics, but uses local `{ pos }` anchors for the three
  diagnostics inside the rewritten exact-shape block.
- The `.values()` / `.keys()` / `.entries()` dispatch and calls to
  `emitForOfHashLowering` are intentionally unchanged.

## Consequences

- **Accepted**: Map / Set `.values()`, `.keys()`, and `.entries()` in for-of
  position still use the existing hash-table lowering.
- **Accepted**: optional calls and optional property accesses still do not take
  the special path.
- **Rejected**: no new discriminated-union narrowing rule, optional-call
  semantics, for-of accepted forms, or generated-C shape is introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing for-of Map / Set values, keys, entries, positive and
  fail cases plus the full self-host probe. `pnpm test` passes with the existing
  277 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6252:8` blocker and now stops at
  `src/codegen.ts:6267:17`:

  ```text
  variable declaration must have an initializer
  ```
