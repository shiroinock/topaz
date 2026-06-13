# 0501 - Array.push call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.34

## Context

ADR [0500](./0500-array-method-call-descriptor-await.md) moved
callback-less, value-returning Array methods onto the ordinary call descriptor
frontier. The next self-hosting blocker is statement-only `Array<T>.push(...)`
with one direct awaited fixed argument. `Array.push` is different from the
previous Array methods because Topaz keeps it `void`, it mutates its receiver,
and ordinary calls already support spread arguments.

## Decision

Extend descriptor-backed call-argument await to fixed-argument `Array.push`
statements only. The Array method descriptor now models the actual fixed
argument list as element-typed params, stores the receiver and any left fixed
arguments before suspension, and resumes into the normal `emitArrayPushCall`
lowering so mutation order and coercion stay shared. Rejected alternatives:
making `Array.push` value-returning would break the dialect's existing void
contract; adding an async-only push emitter would duplicate push evaluation and
spread rules; combining spread with awaited push arguments would need a broader
variadic decomposition phase; callback Array methods, `process.exit`, Promise
APIs, thenable assimilation, and scheduler/task-queue semantics remain
separate phases.

## Implementation

- `src/codegen.ts:4934` keeps awaited spread arguments on the generic deferred
  call-argument diagnostic before any descriptor plan is built.
- `src/codegen.ts:5069` already stores Array receivers as pre-await receiver
  temps; `Array.push` now uses that same path.
- `src/codegen.ts:5125` stores fixed arguments to the left of the awaited
  argument before suspension using the descriptor param metadata.
- `src/codegen.ts:11621` adds `Array.push` to `resolveArrayMethodCallPlan(...)`
  with one actual element-typed param per fixed argument and `void` return.
- `src/codegen.ts:12209` allows awaited `push` to resolve through the Array
  ordinary call plan, while non-push Array methods keep their existing limits.
- `src/codegen.ts:12591` routes ordinary fixed-argument `push` calls through
  the descriptor when no spread is present, then preserves `emitArrayPushCall`.
- `src/codegen.ts:14960` keeps value-position `Array.push` rejected with the
  existing void diagnostic.
- `MEMO.md:426` records phase 5.34 and the remaining async/runtime boundaries.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  class methods, and anonymous async function expressions can use statement
  `xs.push(await value)`, `xs.push(prefix, await value)`, and
  `xs.push(prefix, await value, suffix)`.
- **Preserved**: `Array.push` remains `void`; `const r = xs.push(await value)`
  still rejects with `Array.push returns void in this dialect and cannot be
  used as a value`.
- **Preserved**: ordinary `Array.push(...items)` spread support remains on the
  existing non-await lowering path and is not combined with await this phase.
- **Deferred**: Array callback methods, `process.exit`, Promise APIs,
  PromiseLike / thenable assimilation, scheduler/task-queue semantics, nested
  arguments, multiple awaits, assignment await, and general expression
  decomposition stay outside this phase.
- **Regression**: `examples/async_await_array_push_call_arg.ts` covers all
  accepted async surfaces, receiver/pre-await ordering before `sync tail`,
  post-resumption length/content, and `.then` observer output.
- **Regression**: `examples/await_call_arg_array_push_deferred_fail.ts` pins
  value-position awaited `Array.push` on the existing void diagnostic.
- **Regression count**: the smoke suite now has 461 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
