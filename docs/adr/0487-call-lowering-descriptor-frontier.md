# 0487 - call lowering descriptor frontier

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.20

## Context

ADR [0484](./0484-bare-call-argument-await-decomposition.md), ADR
[0485](./0485-method-call-argument-await-receiver-temps.md), and ADR
[0486](./0486-terminal-return-call-argument-await.md) decomposed call-argument
`await` for ordinary bare and class / interface method calls. Those paths still
resolved parameter lists, receiver temps, labels, and emit routing beside the
normal call emitter, which would encourage one-off async hacks when builtin,
collection, or Promise calls are scouted later.

## Decision

Introduce an internal ordinary call descriptor / plan for existing top-level
function calls, generic function calls, fn-typed value calls, concrete class
method calls, and interface method calls. The descriptor records the call kind,
callee or receiver metadata, parameter list, return type, and diagnostic label,
and the normal emitter now lowers those same plan variants. The async
call-argument await decomposition reads the same plan before deciding which
receiver and left-of-await argument temps to store. Rejected alternatives:
moving all specialized builtin / collection / Promise emitters at once would
hide too much behavior in one phase; an async-only adapter would duplicate the
normal call contract and be deleted later.

## Implementation

- `src/codegen.ts:182` defines the descriptor variants and required metadata
  for ordinary top-level, generic, fn value, class method, and interface method
  calls.
- `src/codegen.ts:4808` routes initializer / terminal-return call-argument
  await decomposition through the descriptor, preserving existing receiver and
  pre-await argument temp ordering.
- `src/codegen.ts:11222` resolves only the ordinary call frontier and leaves
  synthetic namespaces plus specialized builtin / collection / Promise methods
  outside this descriptor seed.
- `src/codegen.ts:11363` emits descriptor-backed calls while preserving current
  C output shapes for direct function calls, fn fat-pointer dispatch, concrete
  method dispatch, and interface vtable dispatch.
- `src/codegen.ts:11501` and `src/codegen.ts:11635` connect ordinary method
  and bare / fn call emit paths to the descriptor after existing specialized
  call emitters have had first refusal.
- `MEMO.md:401` records the 5.20 frontier and keeps the broader call surface
  deferred.

## Consequences

- **Accepted**: `examples/call_lowering_descriptor_baseline.ts` covers bare
  function, generic function, fn-typed value, class method, interface method,
  and an already-supported bare call-argument await initializer path.
- **Preserved**: 5.17, 5.18, and 5.19 async call-argument await behavior keeps
  the same evaluation order and deferred frontier; class receivers remain
  evaluated by normal method calls, while interface receivers still bind once
  into the vtable temp.
- **Deferred**: Array / Map / Set, String / Number, Promise static and method
  calls, synthetic namespaces such as `console`, `process`, `String`,
  `node:*`, optional calls, element access callees, constructors, unsupported
  spread call arguments, non-terminal await, general expression decomposition,
  and local capture across await remain out of scope.
- **Reason**: those specialized surfaces need descriptor cases with explicit
  argument typing and emit metadata before async await can reuse them cleanly;
  this seed is intended to prevent per-builtin async await hacks later, not to
  accept a new language surface.
- **Regression**: `tests/smoke.sh:2952` adds the descriptor baseline sample and
  keeps the existing async positive and deferred fail samples in place; the
  smoke suite now has 435 explicit run entries.
