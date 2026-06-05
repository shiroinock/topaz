# 0300 - object-literal field collection branch locals

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0299](./0299-dunion-object-literal-property-type-alias-cleanup.md) removed the
dunion discriminator-property alias blocker. After phase 266, the self-host
probe advanced to `src/codegen.ts:10930:9`, where object-literal field
collection declared `let fname: string;` and `let valueExpr: Expr;` before the
property-kind branch. TypeScript can prove those locals are assigned by the
supported branches before use, but Topaz intentionally requires every local
declaration to be initialized.

## Decision

Move the field-name and value-expression locals into the two supported property
branches as initialized `const`s, then keep the duplicate-property check,
known-field check, and `valuesByField` store inside each branch. Rejected
alternatives: dummy initial values were rejected because they create meaningless
state solely for subset compliance; `string | undefined` / `Expr | undefined`
sentinels were rejected because the supported variants already provide concrete
values; extracting a helper was rejected because this local cleanup does not
need another abstraction.

## Implementation

- `src/codegen.ts:10930` handles `prop_kv` with initialized branch-local
  `fname` and `valueExpr`, then runs the existing validation/store sequence.
- `src/codegen.ts:10941` handles `prop_shorthand` with an initialized `fname`
  and the same synthesized identifier `Expr`, then runs the same
  validation/store sequence.
- `src/codegen.ts:10957` keeps the spread/unsupported-property diagnostic in the
  final branch with the same message and source anchor.

## Consequences

- **Accepted**: `name: value` object-literal properties and `{ name }`
  shorthand keep the same lowering.
- **Rejected**: object-literal spread, method shorthand, getter / setter, and
  defaulted shorthand remain unsupported with the existing diagnostics.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10930:9` uninitialized-local blocker is
  removed; the next probe blocker should be recorded by the worker outcome.
- **Scope out**: broader object-literal syntax support and loosening Topaz's
  initialized-local rule remain separate decisions.
