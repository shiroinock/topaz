# 0177. signature params explicit void tail

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0176](./0176-type-annotation-type-arg-non-null-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:3871:70`, where `formatSignature` formatted
its C parameter list with `params || "void"`. Topaz keeps conditions strictly
`boolean`, so string truthiness remains unsupported. The neighboring monomorph
signature formatter had the same source shape and would have become the same
cleanup immediately after the top-level formatter.

## Decision

Replace both signature-formatting truthiness tails with an explicit
`params.length > 0 ? params : "void"` local, preserving the generated C text for
empty and non-empty parameter lists.

Rejected alternatives: adding string truthiness would contradict the documented
strict-boolean subset and existing fail coverage; changing only
`formatSignature` would leave the adjacent monomorph path with the same
self-host blocker shape; restructuring signature formatting more broadly would
cross unrelated lowering code without changing the emitted C contract.

## Implementation

- `src/codegen.ts:3867` through `src/codegen.ts:3872` now format top-level
  function signatures through `paramsTail`, with `void` selected only by an
  explicit length check.
- `src/codegen.ts:3903` through `src/codegen.ts:3908` apply the same explicit
  tail selection to monomorph function signatures.
- Parameter declaration joining, C return-type formatting, C symbol names, and
  function body emission remain unchanged.

## Consequences

- **Accepted**: empty parameter lists still emit `void`.
- **Accepted**: non-empty parameter lists still emit the joined C parameter
  declaration string.
- **Rejected**: string truthiness remains unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3871:70` string-truthiness blocker and
  now stops at `src/codegen.ts:3892:15`, where `emitFunctionDefinition` reports
  `` `finally` is unsupported (Phase 1.5-1) ``.
