# 0498 - child process exec call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.31

## Context

ADR [0497](./0497-fs-write-mkdir-call-descriptor-await.md) extended the flat
builtin descriptor frontier to void-returning filesystem calls in
statement/discard position. The remaining compatibility helper on the same
call-site-only line is `node:child_process.execFileSync(cmd, args,
{ stdio: "inherit" })`. It already has strict argument diagnostics, returns
`void`, and carries the `process.spawn` capability through
`src/builtin_descriptors.ts`; call-argument await must reuse those contracts
without making child process APIs asynchronous or first-class.

## Decision

Extend descriptor-backed call-argument await to
`node:child_process.execFileSync` only in statement/discard position. The flat
builtin plan exposes honest `cmd: string` and `args: Array<string>` parameters
for await-temp lowering, while the `{ stdio: "inherit" }` options argument
stays a syntactic literal checked by `checkNodeChildProcessExecFileSyncArgs(...)`
and is not represented as a runtime object parameter. Rejected alternatives:
adding a bespoke branch to `tryBuildCallArgAwaitExpression(...)` would bypass
the descriptor frontier; modeling options as a normal value would loosen the
existing literal contract; accepting process stream helpers, `process.exit`,
Promise APIs, or scheduler/task queue semantics would mix separate effect and
runtime phases into this narrow compatibility helper.

## Implementation

- `src/codegen.ts:213` adds `child_process_exec_file_sync` to the synthetic
  call descriptor kind list.
- `src/codegen.ts:5079` lets this descriptor skip the generic await-argument
  arity check because the original checker validates all three arguments while
  the descriptor only exposes `cmd` and `args` for temp metadata.
- `src/codegen.ts:5410` keeps statement await payload casts warning-free for
  pointer payloads such as `Array<string>` by using a top-level const pointer
  cast.
- `src/codegen.ts:11784` extends `resolveFlatBuiltinCallPlan(...)` with
  `execFileSync`, reusing `checkNodeChildProcessExecFileSyncArgs(...)` and
  returning `void`.
- `src/codegen.ts:11810` removes `execFileSync` from the deferred flat-builtin
  await callee list so accepted statement/discard shapes can reach the plan.
- `src/codegen.ts:12175` emits the descriptor through the existing
  `emitNodeChildProcessExecFileSync(...)` helper.
- `src/builtin_descriptors.ts` remains the source of `process.spawn` effect
  provenance for manifest, check, doctor, and explain behavior.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async class
  methods, and anonymous async function expressions can discard
  `execFileSync(await cmd, args, { stdio: "inherit" })` and
  `execFileSync(cmd, await args, { stdio: "inherit" })`.
- **Preserved**: `execFileSync` returns `void`; value-position
  `const r = execFileSync(await cmd, args, opts)` still rejects.
- **Preserved**: the options argument remains exactly the syntactic literal
  `{ stdio: "inherit" }`; awaited options and runtime option objects remain
  unsupported.
- **Preserved**: `execFileSync` remains call-site-only and cannot be used as a
  first-class function value.
- **Deferred**: process stream helpers, `process.exit`, Promise APIs, nested
  exec arguments, multiple awaits, assignment await, general expression
  decomposition, local capture across await, Promise rejection handlers,
  PromiseLike / thenable assimilation, and scheduler/task queue semantics remain
  separate phases.
- **Regression**: `examples/async_await_child_process_exec_call_arg.ts` covers
  the four accepted async surfaces, pre-await side effects, child-process output
  after resumption, and `.then` observers after completion.
- **Regression**: `examples/await_call_arg_child_process_deferred_fail.ts` pins
  value-position child-process await on the existing void value-use diagnostic.
- **Regression count**: the smoke suite now has 453 explicit run entries.
