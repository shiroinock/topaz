# 0279 - Class and interface member lookup explicit optional checks

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0278](./0278-map-set-method-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from the Map/Set method band into class method lookup. The next
blocker was `src/codegen.ts:9325:10`, where `cls.methods.get(mname)` returned
`MethodInfo | undefined` and the compiler implementation tested that optional
result with a truthy/falsy branch. Topaz conditions are strict `boolean`, so the
implementation must narrow optional lookup results explicitly.

## Decision

Preserve class and interface member semantics exactly while making the local
lookup checks explicit. Class/interface method dispatch, optional method calls,
optional field access, and infer-side class/interface member lookup now compare
`Map.get` results with `=== undefined` or `!== undefined`. Diagnostics in this
member lookup band use stable `{ pos }` anchors where they previously passed
full property-access nodes. Rejected alternatives: making optional lookup
results truthy/falsy was rejected because conditions remain strict boolean;
adding method-as-value support was rejected because this phase only preserves
existing method-call behavior; sweeping unrelated truthy-looking conditions was
rejected to keep the self-host cleanup localized.

## Implementation

- `src/codegen.ts:9317`: `emitClassMethodCall` checks missing class methods
  with `method === undefined` and anchors class method diagnostics on
  `{ pos: callee.pos }`.
- `src/codegen.ts:9340`: `emitInterfaceMethodCall` applies the same explicit
  optional check and diagnostic anchor for interface method calls.
- `src/codegen.ts:9437`: `resolveOptionalFieldType` accepts class/interface
  fields only when the field lookup result is `!== undefined`, preserving
  method-as-value and missing-member rejection.
- `src/codegen.ts:9473`: `resolveOptionalMethodSig` checks optional method
  signatures with `!== undefined` while preserving field-as-method rejection.
- `src/codegen.ts:9758`: infer-side class/interface property access and
  method-call return lookup use explicit undefined checks for field and method
  lookup results.

## Consequences

- **Accepted**: existing valid `class_basic`, `interface_basic`, and
  `optional_chain` behavior is unchanged.
- **Rejected**: calling a field as a method, using a method as a value, missing
  class/interface members, and optional chaining on non-optional receivers remain
  rejected.
- **Regression**: no new examples were added because behavior is unchanged and
  existing smoke cases already cover the class/interface/optional/member-value
  surface. `tests/smoke.sh` has 280 primary compile/run/fail entries, or 296
  `run_*` entries including warning-free variants.
- **Self-host**: the old `src/codegen.ts:9325:10` blocker is removed. The next
  probe blocker is `src/codegen.ts:9428:10` in optional receiver narrowing.
