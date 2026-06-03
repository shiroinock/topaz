# 0253 - new expression callee narrowing cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0252](./0252-collection-monomorph-optional-result-cleanup.md) normalized
collection monomorph optional-result checks. The self-host probe then advanced
to `src/codegen.ts:7566:18`, where `emitNewExpression` checked
`expr.callee.kind !== "ident"` but later read `expr.callee.name` directly.
Topaz does not carry discriminated-union narrowing through repeated property
paths, so constructor callee handling must keep the narrowed value in a local.

## Decision

Preserve all constructor semantics and rewrite new-expression callee name reads
to use local positive `ident` narrowing before reading `.name`. Rejected
alternatives: broadening discriminated-union property access was rejected as a
language semantics change; adding new constructor inference was rejected as
feature scope; rewriting constructor dispatch wholesale was rejected because
existing behavior and diagnostics are already covered; sweeping call-expression
callee handling was rejected as too broad for this phase.

## Implementation

- `src/codegen.ts:7554`: `emitNewExpression` now stores `expr.callee` in a
  local `callee`, rejects non-ident callees, and reads `callee.name` only after
  the positive narrowing path.
- `src/codegen.ts:10269`: infer-side `new_expr` typing applies the same local
  callee narrowing before dispatching `Map`, `Set`, generic class, concrete
  class, interface, and unsupported constructor cases.
- `src/codegen.ts:10508`: `emitWithExpected` now computes the bare
  `new Map()` / `new Set()` contextual-typing guard inside a narrowed
  identifier branch, avoiding compound-condition reads from `expr.callee.name`.

## Consequences

- **Accepted**: `new Map<K, V>()`, context-typed bare `new Map()`,
  `new Set<T>()`, context-typed bare `new Set()`, iterable `new Set<T>(source)`,
  generic class construction, concrete class construction, and class
  construction under expected interface/class contexts keep the same lowering.
- **Rejected**: non-identifier `new` callees, `new Array()`, Map constructor
  arguments, invalid class type arguments, `new` on interfaces, and unknown
  constructors keep the same diagnostics.
- **Regression**: no examples were added because observable behavior is
  unchanged; the existing smoke suite passed with the unchanged 277 `run_*`
  entries plus parser, CLI, and warning-free subchecks.
- **Self-host**: the old `src/codegen.ts:7566:18` callee `.name` blocker is
  resolved. The probe now stops at `src/codegen.ts:7593:30`: type mismatch:
  expected `topaz_class_anon_88`, got `topaz_class_anon_18`.
- **Scope out**: broader discriminated-union narrowing semantics and unrelated
  call-expression callee cleanup remain outside this phase.
