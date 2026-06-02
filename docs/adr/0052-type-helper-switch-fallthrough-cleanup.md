# 0052. Type helper switch fall-through cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0051](./0051-array-predicate-method-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:254`, where grouped scalar `case` labels in
type-helper switches relied on implicit fall-through. Topaz switch lowering
requires every case body to end with `break` or `return`; grouped empty case
bodies are rejected.

## Decision

Replace the `typeEq`, `elemTag`, and `typeIdent` switch dispatches with
straight `if` / `return` ladders. This preserves behavior while keeping the
compiler source inside the current switch subset, whose case-body validation is
intentionally strict.

Rejected alternatives: adding switch fall-through support would be a language
behavior change; only wrapping grouped cases in blocks still leaves case bodies
that are not direct `return` / `break` statements for the current checker;
fixing only the first grouped case would leave identical helper-switch blockers
nearby.

## Implementation

- `src/codegen.ts:241` rewrites `typeEq` as an `if` / `return` ladder.
- `src/codegen.ts:339` rewrites `elemTag` as an `if` / `return` ladder.
- `src/codegen.ts:409` rewrites `typeIdent` as an `if` / `return` ladder.

## Consequences

- **Accepted**: type helper behavior is unchanged.
- **Rejected**: switch fall-through remains unsupported.
- **Regression**: no new example was added because emitted behavior is
  unchanged; existing smoke cases exercise the touched helpers.
- **Future direction**: fall-through can be reconsidered separately if the
  language subset needs it for user code.
