# 0191. Arrow body local narrowing cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0190](./0190-captured-identifier-minimal-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:4343:59`, where `emitArrowBodyText` checked
`arrow.body.kind` and then reread `arrow.body.stmts`. The current Topaz subset
narrows locals more reliably than repeated property reads through a parent
object, and `collectCaptures` had the same arrow-body dispatch shape nearby.

## Decision

Snapshot each arrow body into a local before branching on `kind`, then read
`stmts` or `expr` from that narrowed local. This keeps arrow body emission and
capture walking behavior unchanged while staying inside the compiler-source
subset already supported by Topaz.

Rejected alternatives: adding repeated property-read discriminated-union
narrowing would be broader type-system work; switching arrow bodies to a global
`switch` lowering would not address the underlying local-source cleanup need;
patching only `emitArrowBodyText` would leave the same nearby pattern in
`collectCaptures` as the likely next self-host blocker.

## Implementation

- `src/codegen.ts:4341` snapshots `arrow.body` into `body` in
  `emitArrowBodyText`, then emits block-body statements through `body.stmts` or
  expression bodies through `body.expr`.
- `src/codegen.ts:4539` snapshots nested arrow bodies into `deeperBody` before
  recursively walking deeper capture bodies.
- `src/codegen.ts:4546` snapshots `inner.body` into `innerBody` before walking
  nested arrow captures.
- `src/codegen.ts:4560` snapshots the outer `arrow.body` into `body` before
  walking the arrow body passed to `collectCaptures`.

## Consequences

- **Accepted**: arrow block bodies still emit and walk the same statements.
- **Accepted**: arrow expression bodies still emit and walk the same expression.
- **Rejected**: no discriminated-union narrowing rule, syntax coverage, or
  capture/emission lowering behavior changed.
- **Regression**: no example was added because this compiler-source cleanup is
  covered by the full graph self-host probe plus the existing 277 smoke checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4343:59` `.stmts` narrowing blocker and
  now stops at `src/codegen.ts:4359:10` with `type mismatch: expected
  topaz_boolean, got topaz_union_class_anon_87_or_undefined`.
