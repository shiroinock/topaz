# 0285 - Optional method call argument loop cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0284](./0284-array-map-index-callback.md) advanced the self-host probe into
`emitOptionalMethodCall`, where optional method-call arguments were emitted with
`expr.args.map((a, i) => this.emitWithExpected(a, sig.params[i]!.type))`.
The method already checks `expr.args.length === sig.params.length`, so the
remaining blocker is an implementation-local non-null assertion on a proven
in-bounds parameter lookup rather than an optional-call semantic gap.

## Decision

Replace the `Array.map` expression with an explicit argument loop. The loop
binds both `expr.args[i]` and `sig.params[i]` to locals after the arity check
has proven the indexes correspond, then calls `emitWithExpected`. This preserves
the existing arity diagnostic and the downstream `lowerOptionalChain` behavior.
Rejected alternatives: keeping `sig.params[i]!` was rejected because compiler
code should obey Topaz's non-null assertion rule; rewriting unrelated
`params[i]!` call sites was rejected as broader than this self-host blocker;
changing optional method call arity or type semantics was rejected because the
existing behavior is already covered.

## Implementation

- `src/codegen.ts:9628`: keeps the existing optional method-call arity check and
  diagnostic before emitting the receiver or arguments.
- `src/codegen.ts:9635`: initializes an explicit `argStrs` array and iterates
  over `expr.args`.
- `src/codegen.ts:9637`: binds the argument and matching signature parameter to
  locals, then emits with `param.type`.
- `src/codegen.ts:9648`: continues to lower the present branch through
  `lowerOptionalChain`, preserving class and interface dispatch paths.

## Consequences

- **Accepted**: existing valid optional method-call cases in `optional_chain`
  continue to compile and run.
- **Rejected**: existing optional method-call arity and type failures remain
  rejected; optional function call `f?.()` remains unsupported.
- **Regression**: no new examples were added because this is a self-hostability
  cleanup over existing behavior. Existing `optional_chain` and
  `optional_call_fail` smoke cases cover the required boundary, and
  `tests/smoke.sh` has 282 primary compile/run/fail checks including CLI
  failure checks.
- **Self-host**: the old `src/codegen.ts:9635:70` non-null assertion blocker is
  removed; the probe may now expose a later blocker.
- **Scope out**: broader Array.map changes, optional function calls, and
  unrelated parameter-index cleanups remain out of scope.
