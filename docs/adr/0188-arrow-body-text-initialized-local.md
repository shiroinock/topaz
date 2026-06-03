# 0188. Arrow body text initialized local

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0187](./0187-arrow-body-binding-minimal-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:4291:5`, where `emitArrowFunction` declared
`let bodyText: string;` before branching on the arrow body shape. Topaz
intentionally requires `let` declarations to have initializers, so compiler
source has to stay inside that subset instead of relying on TypeScript's
definite assignment analysis.

## Decision

Initialize `bodyText` directly from a small arrow-body helper that returns the
body text for each already-supported arrow body shape. The helper keeps the
existing `if (arrow.body.kind === "arrow_block_body")` narrowing because the
self-host compiler does not narrow discriminated unions through a ternary
expression yet.

Rejected alternatives: allowing uninitialized `let` would contradict the
documented language divergence and existing fail tests; initializing with a
dummy string and mutating it later would preserve the old assignment shape
instead of making the local genuinely initialized; broadening the pass to all
remaining uninitialized locals would cross unrelated helper regions.

## Implementation

- `src/codegen.ts:4291` now initializes `bodyText` from
  `emitArrowBodyText(arrow, returnType)`.
- `src/codegen.ts:4341` adds `emitArrowBodyText`, preserving block-body
  lowering through `emitBlock(...)`.
- `src/codegen.ts:4349` preserves expression-body lowering by wrapping
  `emitWithExpected(..., returnType)` as `{\n  return <expr>;\n}`.

## Consequences

- **Accepted**: arrow block bodies and expression bodies emit the same C body
  text as before while `emitArrowFunction` no longer contains an uninitialized
  `let`.
- **Rejected**: uninitialized `let` remains unsupported, and no TypeScript
  syntax coverage was removed or narrowed.
- **Regression**: no example was added because this is compiler-source cleanup
  covered by the full graph self-host probe plus the existing 277 smoke checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4291:5` `variable declaration must have
  an initializer` blocker and now stops at `src/codegen.ts:4304:9` with `type
  mismatch: expected topaz_boolean, got topaz_string`.
