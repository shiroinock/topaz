# 0134. monomorph scope restore without finally (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0133](./0133-worklist-drain-without-array-shift.md) moved the full graph
self-host probe to `src/codegen.ts:2463`, where generic class monomorph emission
used `try/finally` to restore `typeParamScope`. Topaz intentionally keeps
`finally` unsupported.

The scope switch is host-side compiler state. On a thrown codegen error, the
current compilation aborts rather than continuing to emit later definitions.

## Decision

Remove the `try/finally` around generic class monomorph method body emission and
restore `typeParamScope` immediately after the normal emission loop.

Rejected alternative: adding `finally` lowering would be a larger language
feature and is unnecessary for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:2458` emits class member definitions directly.
- `src/codegen.ts:2463` restores `typeParamScope` on the normal path.

## Consequences

- **Accepted**: the compiler source avoids `finally` at this self-host blocker.
- **Accepted**: a thrown emission error still aborts the current compile.
- **Rejected**: no `finally` support is added.
- **Regression**: no new example was added because `finally` remains covered as
  an unsupported construct and this is a compiler-source cleanup exercised by the
  full graph probe.
