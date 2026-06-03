# 0252 - collection monomorph optional result cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0251](./0251-collection-expected-optional-cleanup.md) replaced optional
`expected` truthiness in collection constructor helpers. The self-host probe
then advanced to `src/codegen.ts:7543:10`, where
`resolveArrayLiteralType` used `!arr` on the `TopazType | undefined` result
from `arrayOf(elem)`. Topaz conditions are strict boolean, so collection
monomorph availability must keep using the existing `undefined` sentinel while
testing it explicitly.

## Decision

Preserve Array / Map / Set monomorph availability semantics and normalize the
collection monomorph-result checks to `result === undefined` in the local
collection helper and infer-side paths. Rejected alternatives: adding optional
object truthiness was rejected because it weakens strict boolean conditions;
returning a sentinel `TopazType` from `arrayOf` / `mapOf` / `setOf` was
rejected because `undefined` is the established unsupported-monomorph signal;
sweeping every optional-result check in `src/codegen.ts` was rejected as too
broad for this phase.

## Implementation

- `src/codegen.ts:7542`: `resolveArrayLiteralType` now checks the
  `arrayOf(elem)` result with `arr === undefined` before recording the
  monomorph.
- `src/codegen.ts:7637`: `resolveMapConstructorType` now checks the
  `mapOf(k, v)` result with `t === undefined`.
- `src/codegen.ts:7707`: `resolveSetConstructorDeclaredType` now checks the
  `setOf(elem)` result with `t === undefined`.
- `src/codegen.ts:9739`: infer-side array literal typing now checks
  `arrayOf(elem)` with `arr === undefined`.
- `src/codegen.ts:10281`: infer-side `new Map<K, V>()` typing now checks
  `mapOf(k, v)` with `t === undefined`.

## Consequences

- **Accepted**: supported Array literals, `new Map<K, V>()`, and
  `new Set<T>()` continue to resolve and record the same monomorphs.
- **Rejected**: unsupported Array element types, unsupported Map key/value
  combinations, and unsupported Set element types keep the existing
  diagnostics.
- **Regression**: no examples were added because observable behavior is
  unchanged; the existing smoke suite passed with the unchanged 290 top-level
  smoke invocations plus parser and CLI subchecks.
- **Self-host**: the old `src/codegen.ts:7543:10` optional-result truthiness
  blocker is resolved. The probe now stops at `src/codegen.ts:7566:18`:
  cannot access `.name` on the discriminated union value there; narrow it first
  with `switch (x.kind)`.
- **Scope out**: Array.map result monomorph checks and broader optional-value
  cleanup remain outside this phase.
