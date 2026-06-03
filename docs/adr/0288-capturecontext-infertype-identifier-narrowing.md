# 0288 - captureContext inferType identifier narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0287](./0287-codegenerror-raw-node-anchor-cleanup.md) advanced the self-host
probe to `inferType(ident)`, where the capture fallback combined
`local === undefined`, `captureContext !== undefined`, and
`captureContext.captures.has(...)` in one `&&` guard. Topaz does not keep that
compound optional-object narrowing stable enough for the following
`captureContext.captures` access, and the subsequent `Map.get(...)!` would
leave a second unsupported source pattern after the first blocker moved.

## Decision

Split the identifier capture fallback into nested explicit checks: first prove
that there is no local binding, then prove that `captureContext` exists, then
use the `Map.get` result itself as the `T | undefined` narrowing point before
returning the captured type. Rejected alternatives: loosening property access
on `T | undefined` was rejected because strict optional narrowing is a core
subset rule; teaching `Map.has` to narrow a later `Map.get` was rejected because
key-sensitive Map narrowing is broader than this source cleanup; changing
capture lookup order was rejected because local bindings must keep precedence
over capture fallback and top-level function fallback.

## Implementation

- `src/codegen.ts:9722`: keeps local scope lookup as the first identifier type
  source.
- `src/codegen.ts:9725`: nests the `captureContext !== undefined` check under
  the `local === undefined` branch so Topaz sees the optional context narrowed
  before reading `.captures`.
- `src/codegen.ts:9726`: stores `captureContext.captures.get(expr.name)` in a
  local and returns it only after `capturedType !== undefined`, removing the
  non-null assertion from the self-host source.

## Consequences

- **Accepted**: captured identifiers inside arrow bodies still infer to the
  captured `TopazType`.
- **Accepted**: local identifiers still take precedence over captured names.
- **Rejected**: unknown identifiers still fall through to top-level function
  value lookup and then the existing unknown identifier diagnostic.
- **Regression**: no examples were added because existing arrow capture tests
  and the self-host probe cover this source cleanup; `tests/smoke.sh` remains at
  282 primary compile/run/fail checks including CLI failure checks.
- **Self-host**: the old `src/codegen.ts:9725:66` optional capture-context
  blocker is removed; any later probe blocker is a separate phase.
- **Scope out**: key-sensitive `Map.has` / `Map.get` narrowing and broader
  capture semantics changes remain out of scope.
