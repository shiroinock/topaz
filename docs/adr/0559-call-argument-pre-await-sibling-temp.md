# 0559 - Call Argument Pre-Await Sibling Temp

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.92

## Context

ADR [0507](./0507-call-argument-expression-await.md) allowed descriptor-backed
call arguments to contain one direct/simple awaited expression, but it rejected
side-effectful sibling expressions such as `mark() + await p`. That preserved
correct evaluation order by avoiding subexpression temps, but it left common
left-to-right call argument shapes unavailable even when the awaited operand was
still direct/simple and the sibling could be captured before suspension.

## Decision

Accept only a non-logical binary call argument where the right side contains the
single collected `await_expr`, the right side is still direct/simple by the
existing call-argument await predicate, and the left side contains no await and
is supported as one pre-await sibling temp. The left sibling type is inferred
before await replacement, stored in the async frame immediately before the
awaited source is evaluated, and used after resume with the awaited temp to
rebuild the argument. Rejected alternatives: arbitrary expression
decomposition would need a general temp scheduler; accepting await-left with a
side-effectful right sibling would either run the right side too early or need a
separate post-await model; and Promise / PromiseLike assimilation remains a
separate async runtime decision.

## Implementation

- `src/codegen.ts:5821` tracks an optional sibling temp alongside the awaited
  argument transform.
- `src/codegen.ts:5840` falls back from direct/simple replacement to the
  sibling-temp builder before using the shared unsupported await diagnostic.
- `src/codegen.ts:6033` appends the sibling temp after receiver temps and
  strictly earlier argument temps, preserving call evaluation order before the
  awaited source is evaluated by the existing frame store path.
- `src/codegen.ts:6058` recognizes the narrow binary shape, infers the left
  sibling type, declares the frame temp, and rewrites the resumed argument with
  the sibling temp plus awaited temp.
- `src/codegen.ts:6103` keeps logical, assignment, update, object/array,
  `new`, ternary, and other broad decomposition surfaces out of this slice.
- `MEMO.md:485` records the phase boundary while leaving
  `Promise.resolve(Promise<T>)` flattening and thenable assimilation deferred.

## Consequences

- **Accepted**: initializer, expression-statement discard, and terminal return
  descriptor-backed call-argument await can now evaluate a side-effectful left
  sibling before suspension for bare calls, synthetic/static calls, flat
  builtins, and descriptor-backed method calls.
- **Preserved**: receiver temps and arguments strictly before the awaited
  argument keep their existing order and storage machinery.
- **Rejected**: `await p + mark()` remains on the shared unsupported await
  diagnostic because the right sibling must run after resume.
- **Regression**: `async_await_call_arg_pre_sibling_temp` covers the accepted
  surfaces, and `await_call_arg_pre_sibling_mirror_deferred_fail` pins the
  mirror-shape boundary. Existing side-effectful-left `_fail` fixtures were
  retargeted so `_fail` names still fail.
- **Regression count**: the smoke suite now has 611 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.
