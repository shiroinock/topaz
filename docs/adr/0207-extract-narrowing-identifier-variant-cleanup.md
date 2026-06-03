# 0207. extractNarrowing identifier variant cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 173 and [0206](./0206-carry-narrowing-strict-optional-cleanup.md)
moved the full graph self-host probe into `extractNarrowing`, where the
`instanceof_expr` path checked `cond.lhs.kind !== "ident"` and
`cond.rhs.kind !== "ident"` before reading `.name` directly from those
discriminated-union expressions. Topaz requires variant-specific fields such
as `.name` to be read only after `switch (x.kind)` narrowing. The same local
helper also had adjacent truthy optional checks that no longer match the
strict optional style.

## Decision

Normalize only `extractNarrowing` without changing which conditional forms it
recognizes. The `instanceof_expr` branch now copies `cond.lhs` and `cond.rhs`
to local expressions, extracts `lhsName` and `rhsName` through `switch
(x.kind)`, and reuses those string locals for lookup, class validation, and
the returned narrowing. The `x === undefined` / `x !== undefined` branch now
extracts `varName` with the same switch style before lookup and return.

Rejected alternatives: relaxing discriminated-union field access after an
`if (x.kind === "...")` guard was rejected because Topaz's current subset uses
`switch (x.kind)` as the accepted narrowing form. Adding new narrowing
patterns or changing `instanceof` behavior was rejected because this phase is
source cleanup for an existing helper. Sweeping the adjacent
`extractDiscriminatorNarrowing` initializer issue was rejected because it is
the next blocker and outside this phase's ownership.

## Implementation

- `src/codegen.ts:5177-5200` extracts `lhsName` and `rhsName` from local
  `Expr` variables using `switch (x.kind)` before reading `.name`, then uses
  those strings for `scope.lookup`, `classes.has`, `classOf`, and the returned
  narrowing.
- `src/codegen.ts:5228-5229` replaces the discriminator narrowing truthiness
  check with `dn !== undefined`.
- `src/codegen.ts:5233-5253` extracts `varName` from the undefined-check
  operand through `switch (varNode.kind)` and replaces `if (!inner)` with
  `inner === undefined`.

## Consequences

- **Accepted**: existing `instanceof`, compound, discriminator, and undefined
  check narrowing forms are still recognized with the same semantics.
- **Rejected**: no new narrowing forms, optional truthiness, or broader
  discriminated-union field access rules are introduced.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing `instanceof`, optional narrowing, compound
  narrowing, carry-narrowing, and full smoke coverage.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5179:40` identifier-variant blocker
  and now stops at `src/codegen.ts:5268:5`, where
  `extractDiscriminatorNarrowing` declares locals without initializers.
