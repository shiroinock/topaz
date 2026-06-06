# 0317 - array nested monomorph

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3b

## Context

[0316](./0316-post-selfhost-backlog-audit.md) split Phase 2.3 and made the
next step start from a concrete generic function `Array<T>` monomorph sample.
The scout showed flat generic `Array<T>` returns are already covered by
`examples/generic_fn.ts`. The missing path was a generic function returning
`Array<Array<T>>`, which failed while forming the outer array monomorph:
`no Array monomorph for element type topaz_array_number`.

Earlier self-host prep work intentionally left nested containers out of scope
for compiler-internal blockers, but this phase is a user-facing generic array
gap rather than an emergent self-host blocker.

## Decision

Support array values as array elements. `Array<Array<T>>` lowers as an outer
`topaz_array_array_<T> *` whose C element type is the inner array pointer
`topaz_array_<T> *`. Element tags now spell array elements as
`array_<inner-short>`, and array monomorph recording registers the inner array
before the outer array.

Rejected alternatives: adding Map/Set nested container support was rejected
because it would require hash/equality and optional-value policy decisions.
Adding nested `.join()` formatting was rejected because existing array join
support is scalar-only. Rewriting generic function monomorph storage was
rejected because the missing path is only the nested array element type.

## Implementation

- `src/codegen.ts:218` allows `arrayOf` to accept another array as its element.
- `src/codegen.ts:398` gives array elements the `array_<inner>` tag used by
  `topaz_array_array_number` and `topaz_array_array_class_Cell`.
- `src/codegen.ts:1296` records the inner array monomorph before recording the
  outer monomorph.
- `src/codegen.ts:2821` emits `TOPAZ_ARRAY_DEFINE` for array element arrays
  through the shared container C element helper.
- `src/codegen.ts:2961` returns `cTypeName(elem)` for array container elements,
  preserving pointer storage for the inner array.
- `examples/array_nested.ts:1` adds the positive generic `Array<Array<T>>`
  sample with scalar and class instantiations, plus outer push and spread.
- `tests/smoke.sh:169` adds the `array_nested` smoke case.
- `MEMO.md` marks the `2.3b` action items complete.

## Consequences

- **Accepted**: `Array<Array<T>>` is the first nested container shape supported
  by Topaz.
- **Accepted**: ordinary array operations on the outer value reuse existing
  array literal, index access, push, and spread lowering.
- **Rejected**: `Array<Map<K,V>>`, `Array<Set<T>>`, nested Map/Set values or
  keys, iterator-in-container storage, and nested array join remain out of
  scope.
- **Regression**: `array_nested` covers `Array<Array<number>>`,
  `Array<Array<Cell>>`, indexing through `matrix[0][0]`, outer push, and spread.
- **Regression**: `tests/smoke.sh` now has 301 smoke invocations.
- **Scope out**: broader nested container semantics remain future work.
