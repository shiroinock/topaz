# 0582 - Multi-await synthetic binary call arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.115

## Context

Phases 5.25-5.28 descriptorized pure synthetic and flat builtin calls such as
`String.fromCharCode`, `parseInt`, Node path helpers, and `fileURLToPath`.
[5.114](./0581-multi-await-binary-call-arguments.md) then connected one
all-await-leaf binary argument to the ordered multi-await call-argument planner,
but it intentionally left synthetic/builtin descriptors out of that first pass.
The gap is now narrow: these selected descriptors already return ordinary
values and use the same call-plan signature and emission machinery.

## Decision

Allow `tryBuildMultiAwaitCallArgExpression` to accept `synthetic_call` plans
only when the synthetic kind is a fixed pure value-returning set:
`String.fromCharCode`, `parseInt`, `parseFloat`, `dirname`, `basename`,
`extname`, `resolve`, `join`, and `fileURLToPath`. The planner still requires a
single paren-unwrapped non-short-circuit binary argument whose leaves are all
direct/simple `await` expressions, schedules those leaves in source order, and
emits the existing synthetic descriptor once after replacing the await leaves
with frame temps.

Rejected alternatives: Promise synthetic calls are Promise ABI surface, not
plain value builtins; void and side-effect synthetic calls such as console,
process, filesystem writes, and `execFileSync` do not belong in value
positions; mixed non-await leaves need capture policy; short-circuiting,
nested decomposition, optional/spread/new/element calls, receiver-await
synthetics, scheduler/runtime changes, and thenable assimilation stay outside
this slice.

## Implementation

- `src/codegen.ts:6486` widens the receiver-free multi-await call-argument
  plan-kind check to allow synthetic calls only through the new fixed allowlist.
- `src/codegen.ts:6606` adds `isMultiAwaitBinarySyntheticCallArgKind`, keeping
  Promise, void, and side-effect synthetic descriptors excluded by default.
- `examples/async_await_synthetic_binary_call_arg.ts` covers declaration
  initializer, terminal return, and expression-statement discard cases with
  `.then(...)` callbacks that prove source-order suspension.
- Existing synthetic deferred fail samples now use mixed non-await leaves so
  they keep pinning the nearest still-deferred shape.

## Consequences

- **Accepted**: one all-await-leaf binary argument for `String.fromCharCode`,
  `parseInt` / `parseFloat`, path helpers, and `fileURLToPath`.
- **Preserved**: ordered suspension, final single synthetic call emission,
  existing descriptor arity/type checks, async-frame scheduling, and the
  current runtime and Promise ABI.
- **Rejected**: Promise synthetic calls, void or side-effect synthetic calls,
  receiver-await synthetics, mixed leaves, short-circuiting, multiple awaited
  arguments plus a binary awaited argument, nested call roots, optional/spread
  calls, constructor/element calls, thenable assimilation, and runtime changes.
- **Regression**: `async_await_synthetic_binary_call_arg` proves the new
  positive surface; `await_call_arg_string_static_deferred_fail`,
  `await_call_arg_nested_flat_builtin_deferred_fail`, and
  `await_call_arg_path_variadic_deferred_fail` keep mixed leaves deferred.
- **Regression count**: smoke now covers 650 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
