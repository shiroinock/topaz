# 0283 - Optional chain present emitter function call

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0282](./0282-optional-chain-absent-predicate-initialization.md) advanced the
self-host probe from optional-chain absent predicate initialization into the
same helper's present branch. The next blocker was `src/codegen.ts:9540:24`,
where `lowerOptionalChain` called `args.emitPresent(tmp)` on a type-literal
argument. Topaz currently treats property calls as method dispatch and therefore
reported that the anonymous object shape had no method `emitPresent`.

## Decision

Refactor `lowerOptionalChain` to take its optional-chain ingredients as direct
parameters, including `emitPresent` as a direct function-valued parameter, and
call `emitPresent(tmp)` inside the helper. Keep optional-chain runtime lowering
unchanged: interface receivers still test `.data == NULL`, class / Array / Map /
Set receivers still test the pointer against `NULL`, result widening still uses
`makeUnion`, absent values still come from `emitUndefinedLiteral`, and present
values still pass through `applyCoercion`. Rejected alternatives: adding method
dispatch semantics for function-valued object properties was rejected because it
would broaden the language surface; method-as-value or object method shorthand
support was rejected as unrelated; changing optional-chain result or sentinel
semantics was rejected because this phase is only a self-hostability cleanup.

## Implementation

- `src/codegen.ts:9524`: `lowerOptionalChain` now accepts positional parameters
  instead of a type-literal object argument.
- `src/codegen.ts:9540`: the present branch now calls the function-valued
  parameter directly with `emitPresent(tmp)`.
- `src/codegen.ts:9550`, `src/codegen.ts:9572`, and `src/codegen.ts:9597`:
  optional property access, element access, and method call pass their existing
  present emitters as direct callback arguments.

## Consequences

- **Accepted**: existing valid `optional_chain`, `optional_basic`,
  `optional_narrow`, `optional_map_get`, `optional_param`, and
  `dunion_optional` behavior is unchanged.
- **Rejected**: `optional_chain_non_optional_fail`, `optional_call_fail`, and
  optional parameter / field narrowing fail cases remain rejected through the
  existing diagnostics.
- **Regression**: no new examples were added because this only changes the
  helper's TypeScript source shape. `tests/smoke.sh` remains at 280 primary
  compile/run/fail entries.
- **Self-host**: the old `src/codegen.ts:9540:24` function-valued property call
  blocker is removed; the probe now reaches the later `src/codegen.ts:9595:35`
  `Array.map` callback arity blocker.
- **Scope out**: function-valued object property calls, method-as-value support,
  object method shorthand support, optional call syntax, and optional-chain
  runtime semantics are unchanged.
