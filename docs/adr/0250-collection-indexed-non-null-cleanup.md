# 0250 - collection indexed non-null cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0249](./0249-array-reserve-count-string-cleanup.md) removed the unsupported
compiler-local `String(...)` conversion in array-literal spread reserve
construction. The self-host probe then advanced to `src/codegen.ts:7490:25`,
where `spreadTmps[spIdx++]!` was rejected because Topaz non-null assertions are
only meaningful on `T | undefined` operands. The indexed read already has the
array element type in this subset, so the assertion was a compiler-source
cleanup issue rather than a collection semantics change.

## Decision

Remove redundant non-null assertions after indexed reads in the collection
literal and constructor helper paths, while preserving meaningful assertions on
helper results that actually return `T | undefined` such as `arrayElem(...)!`
and `setElem(...)!`. Rejected alternatives: allowing no-op non-null assertions
was rejected because it weakens the subset rule; changing array indexing to
return `T | undefined` was rejected as a broad language/runtime decision;
sweeping every indexed-read assertion in `src/codegen.ts` was rejected because
this phase owns only collection literal and constructor helpers.

## Implementation

- `src/codegen.ts:7490`: `emitArrayLiteral` reads the spread temp directly from
  `spreadTmps[spIdx++]`.
- `src/codegen.ts:7506` and `src/codegen.ts:9729`: array-literal element
  inference reads the first element directly from `expr.elems[0]`.
- `src/codegen.ts:7633`, `src/codegen.ts:7634`, and `src/codegen.ts:7704`:
  `Map` / `Set` constructor helper type arguments are read directly after the
  length checks that guard them.
- `src/codegen.ts:7693` and `src/codegen.ts:7730`: `Set` iterable constructor
  helpers read the single constructor source directly after the arity checks.
- `src/codegen.ts:9733`: infer-side array-literal validation reads later
  elements directly from `expr.elems[i]`.

## Consequences

- **Accepted**: array-literal spread, array-literal inference, `Map`
  constructor type resolution, and `Set` iterable construction behavior remain
  unchanged.
- **Rejected**: no-op `!` on non-optional values remains rejected, and optional
  helper-result assertions remain in place where they encode validated
  `T | undefined` narrowing.
- **Regression**: no examples were added because observable collection behavior
  is unchanged; existing spread, Map, Set, iterator, and non-null assertion
  coverage passed in `pnpm test`.
- **Self-host**: the old `src/codegen.ts:7490:25` non-null assertion blocker is
  resolved. The probe now stops at `src/codegen.ts:7525:12: type mismatch:
  expected topaz_boolean, got topaz_union_dunion_anon_50_or_anon_51_or_anon_52_or_anon_53_or_anon_54_or_anon_55_or_anon_56_or_anon_57_or_anon_58_or_anon_59_or_anon_60_or_anon_61_or_anon_62_or_anon_63_or_anon_64_or_anon_86_or_undefined`.
- **Scope out**: broader truthiness cleanup, optional-value condition rewrites,
  and non-collection indexed-read cleanup remain outside this phase.
