# 0507 - Call Argument Expression Await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.40

## Context

ADR [0506](./0506-assignment-rhs-expression-await.md) widened assignment
statement RHS await from direct `await promise` to a single simple expression
containing that await. Call-argument await still required the whole argument to
be direct `await promise`, even though the descriptor-backed call frontier from
ADRs [0487](./0487-call-lowering-descriptor-frontier.md) through
[0502](./0502-promise-resolve-call-descriptor-await.md) already owns arity,
parameter, receiver, and return metadata for the supported call surfaces.

## Decision

Accept one call argument whose expression contains the collected `await_expr`
when that argument is direct await or a simple side-effect-free expression.
The awaited operand still suspends first; receiver temps and arguments strictly
before the awaited argument are captured exactly as in the direct-argument path;
the transformed argument and later arguments are evaluated on resume. Rejected
alternatives: broad expression decomposition would need explicit subexpression
temps; reusing the assignment/simple-expression predicate would accept
side-effectful sibling expressions such as `mark() + await p`; and adding
callee-specific branches would bypass the ordinary call descriptor frontier.

## Implementation

- `src/codegen.ts:5111` now identifies the single argument containing the
  collected await instead of requiring that argument to unwrap directly to
  `await_expr`.
- `src/codegen.ts:5126` rewrites that argument by replacing only the awaited
  node with the awaited-temp identifier, then `src/codegen.ts:5154` validates
  the transformed signature call through `resolveOrdinaryCallPlan(...)`.
- `src/codegen.ts:5307` keeps pre-await argument temps limited to arguments
  strictly before the awaited argument, preserving the phase 5.17 evaluation
  model.
- `src/codegen.ts:5376` adds a call-argument-specific simple-expression
  predicate, and `src/codegen.ts:5409` rejects calls, methods, `new`,
  assignments, updates, object/array literals, ternary/logical expressions, and
  property or element reads in non-await sibling expressions.
- `MEMO.md:433` records phase 5.40 in the async compatibility track.

## Consequences

- **Accepted**: descriptor-backed top-level, generic, fn-value, class/interface
  method, collection/scalar method, synthetic, flat builtin, path, fs/process,
  child-process, and `Promise.resolve` call-argument await can use one simple
  awaited argument expression in initializer, terminal return, and
  expression-statement discard positions.
- **Preserved**: direct awaited arguments still use the same call descriptor
  metadata and pre-await receiver/argument temp model.
- **Deferred**: multiple awaits, awaited receiver plus awaited argument,
  side-effectful sibling expressions, arbitrary nested decomposition, control
  flow await, try/catch/finally await, Promise rejection handlers, thenable
  assimilation, scheduler work, and top-level await.
- **Regression**: `examples/async_await_call_arg_expression.ts` covers bare
  expression-statement calls, `String.fromCharCode`, parser builtins, variadic
  path helpers, and a terminal return method call.
- **Regression**: the retargeted deferred samples keep side-effectful sibling
  call expressions on the shared unsupported await diagnostic.
- **Regression count**: the smoke suite now has 470 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
