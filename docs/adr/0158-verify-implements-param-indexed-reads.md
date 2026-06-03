# 0158. verify implements parameter indexed reads (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0157](./0157-verify-implements-explicit-lookups.md) moved the full graph
self-host probe to `src/codegen.ts:3173`, where `verifyImplements` used
`got.params[i]!` and `want.params[i]!` while comparing class method parameters
against interface method parameters. Topaz array indexing returns the element
type directly, so a non-null assertion is only valid for a `T | undefined`
operand and is rejected here.

## Decision

After the existing parameter-count equality check, read `got.params[i]` and
`want.params[i]` into loop-local variables without non-null assertions, then use
those locals for the type equality check and diagnostic formatting.

Rejected alternative: allowing redundant non-null assertions on non-optional
array element reads would broaden the language rule and contradict earlier 6i
cleanup decisions.

## Implementation

- `src/codegen.ts:3173` stores `got.params[i]` in `gotParam`.
- `src/codegen.ts:3174` stores `want.params[i]` in `wantParam`.
- `src/codegen.ts:3175` compares `gotParam.type` with `wantParam.type`.
- `src/codegen.ts:3178` formats the diagnostic from the same locals.

## Consequences

- **Accepted**: interface method parameter verification stays within current
  array indexing and non-null assertion semantics.
- **Rejected**: no language-wide change to non-null assertion handling.
- **Regression**: no new example was added because this is a compiler-source
  cleanup covered by the full graph self-host probe.
