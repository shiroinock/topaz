# 0192. Optional lookup presence cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0191](./0191-arrow-body-local-narrowing-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4359:10`, where `emitCapturedIdentifier`
tested a `Binding | undefined` lookup result with a truthy/falsy condition.
Topaz intentionally requires `boolean` conditions, so compiler-source presence
tests for optional lookup objects need explicit `undefined` comparisons instead
of relying on JavaScript object truthiness.

## Decision

Normalize the scoped lookup and capture-context presence checks in the
identifier/capture/narrowing paths to explicit `value === undefined` or
`value !== undefined` checks, then assign the narrowed value to a local.
Snapshot `this.captureContext` before checking it inside identifier reads.

Rejected alternatives: adding general object truthiness would broaden the
language subset beyond the self-hosting source cleanup; changing `Scope.lookup`,
`Scope.lookupBase`, or capture-map semantics would alter lowering behavior; a
single-line non-null assertion would keep the same narrowing problem hidden from
the source subset.

## Implementation

- `src/codegen.ts:4357` rewrites `emitCapturedIdentifier` to use `bMaybe` and
  `baseMaybe`, preserving the visible capture diagnostic and adding an explicit
  missing-base diagnostic for the invariant case.
- `src/codegen.ts:4873` and `src/codegen.ts:4917` split `extractNarrowing`
  lookup guards for `instanceof` and `undefined` checks into explicit absent
  checks followed by narrowed binding locals.
- `src/codegen.ts:4958` rewrites `extractDiscriminatorNarrowing` lookup and
  matched-class presence checks without truthy/falsy optional-object tests.
- `src/codegen.ts:6294` and `src/codegen.ts:8758` snapshot `captureContext`
  before checking capture reads in `emitExpression` and `inferType`.
- `src/codegen.ts:9490` rewrites assignment-target identifier lookup to carry a
  narrowed binding local into the const-assignment check.

## Consequences

- **Accepted**: capture initialization still emits narrowed scalar optional,
  dunion, and unknown reads the same way.
- **Accepted**: identifier lookup, narrowing extraction, and assignment-target
  diagnostics keep their existing behavior for supported programs.
- **Rejected**: no truthy/falsy rule, new syntax support, or capture/env
  lowering change was added.
- **Regression**: no example was added because this compiler-source cleanup is
  covered by the full graph self-host probe plus the existing 277 smoke checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4359:10` boolean-condition blocker and
  now stops at `src/codegen.ts:4395:20` with `Set() constructor arguments are
  unsupported (initialize via .set/.add)`.
