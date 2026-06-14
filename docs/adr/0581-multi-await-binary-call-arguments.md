# 0581 - Multi-await binary call arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.114

## Context

[5.101](./0568-multi-await-bare-call-arguments.md) through
[5.106](./0573-awaited-collection-receiver-arguments.md) made ordered
multi-await call arguments descriptor-aware for direct awaited arguments and
selected receivers. [5.107](./0574-multi-await-binary-initializer.md) through
[5.111](./0578-nested-multi-await-binary-tree.md) already established the
source-order binary-tree await leaf planner for root expressions. The remaining
`foo(await a + await b)` gap is a composition gap: the async frame, suspension
temps, and ordinary call descriptor machinery already exist.

## Decision

Extend `tryBuildMultiAwaitCallArgExpression` so one call argument may be a
paren-unwrapped non-short-circuit `bin_op` tree whose leaves are all
direct/simple `await` expressions. The planner collects those leaves in source
order, declares the existing `<tempPrefix>_0`, `<tempPrefix>_1`, ... temps,
replaces the leaves with temps for both signature checking and final emission,
and otherwise keeps the existing call plan responsible for arity, parameter
typing, receiver temps, pre-await earlier-argument temps, and return typing.

Rejected alternatives: a general expression decomposer is still too broad;
logical/nullish roots need branch-sensitive continuation state; mixed
non-await leaves such as `await a + side() + await b` require value capture and
evaluation-order policy; nested call roots, optional/spread/constructor/element
calls, and descriptor-specific builtin expansions stay outside this slice.
Void awaited payloads remain invalid as binary argument values.

## Implementation

- `src/codegen.ts:5815` updates the shared deferred diagnostic to list narrow
  multi-await binary call arguments.
- `src/codegen.ts:6388` recognizes either the existing direct awaited argument
  set or one all-await-leaf binary argument, rejecting mixtures.
- `src/codegen.ts:6427` resolves each binary leaf await in source order,
  rejects void payloads for the binary path, and maps leaves to the existing
  call-argument temp prefix.
- `src/codegen.ts:6439` builds the temp-replaced binary argument that is used
  for both descriptor signature planning and the final transformed call.
- `src/codegen.ts:6575` preserves the existing receiver temp and earlier
  argument temp attachment rules by leaving the ordered planned-step loop in
  charge of the first relevant suspension boundary.

## Consequences

- **Accepted**: declaration initializer, terminal-return, and expression
  statement discard calls with one all-await-leaf binary argument.
- **Preserved**: existing descriptor-backed call validation, direct
  multi-await arguments, awaited receiver support, single final call emission,
  async-frame scheduling, and the current runtime/scheduler.
- **Rejected**: mixed non-await binary leaves, short-circuiting operators,
  arbitrary expression decomposition, nested call roots, optional/spread calls,
  constructor/element calls, builtin surface widening, Promise ABI changes,
  thenable assimilation, and scheduler work.
- **Regression**: `async_await_call_arg_binary_multiple` proves discard,
  initializer, and terminal-return call arguments with ordered second operand
  side effects; `await_expression_statement_deferred_fail` now pins the nearest
  mixed-leaf call-argument shape as deferred.
- **Regression count**: smoke now covers 652 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
