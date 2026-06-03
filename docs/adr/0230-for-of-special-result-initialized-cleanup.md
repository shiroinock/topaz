# 0230. for-of special result initialized cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0229](./0229-for-of-special-call-narrowing.md) moved the full-graph
self-host probe to `src/codegen.ts:6267:17`, where `emitForOfStatement` still
declared `keyType`, `valueType`, `bindType`, and `field` before assigning them
inside Map / Set `.entries()`, `.values()`, and `.keys()` branches. Topaz
requires declaration initializers, so these result-shape locals blocked
self-hosting even though the emitted for-of C was already correct.

## Decision

Use initialized branch-local result objects for Map / Set for-of special-form
metadata, and bind optional `mapKey`, `mapValue`, and `setElem` results before
using them. Missing helper results now fail with concise internal
`CodegenError`s anchored at the special-form call. The private hash-lowering
bind spec keeps the same runtime values but stores slot field names as `string`
because self-hosting cannot assign string-literal fields to a `"key" | "value"`
object property without widening through `string`.

Rejected alternatives: broadening uninitialized local handling was rejected as
language-semantics scope; keeping non-null assertions was rejected because the
self-host path needs explicit optional checks; splitting hash bind specs into
multiple same-discriminant variants was rejected because Topaz discriminated
unions require unique literal discriminants.

## Implementation

- `src/codegen.ts:6267-6321` now handles Map / Set `.entries()` with initialized
  `pairInfo` and `bindSpec` objects instead of uninitialized `keyType` /
  `valueType` locals.
- `src/codegen.ts:6330-6374` now handles Map `.values()`, Map `.keys()`, and Set
  `.values()` / `.keys()` with initialized `singleInfo` and `bindSpec` objects
  instead of uninitialized `bindType` / `field` locals.
- `src/codegen.ts:6505-6516` keeps `emitForOfHashLowering`'s single / pair
  bind-spec shape, but accepts field names as private strings so the existing
  `"key"` / `"value"` arguments remain self-hostable.

## Consequences

- **Accepted**: Map / Set `.entries()`, `.values()`, and `.keys()` in for-of
  position lower through the same hash-table walk as before.
- **Rejected**: no new Map / Set for-of forms, diagnostics, iterator lowering,
  or generated-C shape are introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing for-of Map / Set values, keys, entries, positive and
  fail cases plus the full self-host probe. `pnpm test` passes with the existing
  277 smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6267:17` blocker and now stops at
  `src/codegen.ts:6388:9`:

  ```text
  type mismatch: expected topaz_class_anon_88, got topaz_class_anon_43
  ```
