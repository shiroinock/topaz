# 0206. carry narrowing strict optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 172 added `String.prototype.repeat` and moved the full graph self-host
probe to `src/codegen.ts:5114:23`, where `applyCarryNarrowing` used optional
`stmt.elseBranch` directly in strict boolean positions. Topaz conditions remain
strict `boolean`, and optional object truthiness is intentionally out of scope.
The adjacent `alwaysExits` helper also still had a non-null assertion on the
last statement of a non-empty block.

## Decision

Normalize only the local carry-narrowing cluster to explicit optional
presence checks and indexed-read narrowing. `applyCarryNarrowing` now computes
`elseBranchMaybe`, `elseExits`, and `hasElseBranch` with `!== undefined`, then
passes literal carry polarities directly to `extractNarrowing` inside the
matching branch. `alwaysExits` now reads the last block statement into an
annotated optional local and treats a missing value after the length guard as
an internal invariant.

Rejected alternatives: adding truthy/falsy optional condition semantics was
rejected because it would change Topaz's strict boolean rule. Reworking
compound-condition or `extractNarrowing` semantics was rejected because this
phase only cleans up the local carry-narrowing source shape. Sweeping other
statement helpers was rejected to keep the self-hosting step reversible.

## Implementation

- `src/codegen.ts:5114-5119` narrows `stmt.elseBranch` through
  `elseBranchMaybe !== undefined` and records `hasElseBranch` as a boolean.
- `src/codegen.ts:5120-5134` removes the optional `carryPolarity` accumulator
  and applies the existing narrowing only in branches with concrete `true` or
  `false` polarities.
- `src/codegen.ts:5145-5152` replaces the block last-statement non-null
  assertion with an annotated optional local, positive `!== undefined`
  narrowing, and an internal invariant error.
- `src/codegen.ts:5154-5158` replaces the combined `if_stmt && elseBranch`
  truthiness check with a nested explicit optional check.

## Consequences

- **Accepted**: existing early-exit carry narrowing behavior is preserved for
  `if` statements with no `else`, a non-exiting `else`, or an exiting `else`.
- **Rejected**: optional object truthiness, broader compound-condition
  narrowing, and `extractNarrowing` behavior changes remain out of scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing carry-narrowing / strict-boolean smoke cases and
  the full graph self-host probe.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5114:23` strict optional blocker and
  now stops at `src/codegen.ts:5179:40`, where the `instanceof_expr` path in
  `extractNarrowing` accesses `.name` on a discriminated-union expression
  without first narrowing through `switch (x.kind)`.
