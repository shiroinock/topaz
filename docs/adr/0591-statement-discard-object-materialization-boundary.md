# 0591 - Statement-discard object materialization boundary

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.124

## Context

[0584](./0584-expression-statement-multi-await-object-literals.md) accepted
expression-statement object literals only when every property value is a
direct/simple `await`, because that shape can run ordered suspensions and then
discard the statement without creating a standalone object value.
[0587](./0587-contextual-mixed-pure-multi-await-object-literals.md) through
[0590](./0590-contextual-object-nested-object-awaits.md) expanded mixed-pure,
shorthand, nested array, and nested object property values only for contextual
declaration initializers and terminal returns, where an explicit target type
controls final object emission. The next statement-discard expansion would need
to decide whether an object is actually materialized before being discarded.

## Decision

Keep mixed-pure, shorthand, nested array, and nested object property values
rejected in expression-statement discard for now. If statement-discard object
literals are expanded later, do it as a narrow ephemeral materialization
descriptor: the final async-frame completion may build a temporary standalone
object literal solely to preserve object-literal evaluation semantics, then
immediately discard the result. That descriptor must be introduced explicitly
before any implementation slice accepts the broader statement form.

Rejected alternatives: directly accepting the broader statement form now would
hide standalone object typing, allocation, and spread policy inside lowering
code; evaluating only property values without building an object would be cheap
but would not compose with future spread, computed keys, methods, or side-effect
ordering; treating this as full JS object literal compatibility would pull in
too much surface for the current async frontier.

## Implementation

- No product-code lowering changes are made by this decision.
- `docs/adr/0584-expression-statement-multi-await-object-literals.md` remains
  the current accepted statement-discard behavior: ordered all-await properties
  run, and no standalone object value is emitted.
- Future implementation should add a named descriptor or equivalent planner
  boundary before accepting mixed-pure or nested statement-discard object
  literals, so the materialize-then-discard semantics are not implicit.

## Consequences

- **Accepted**: a design boundary for future statement-discard object literal
  expansion.
- **Preserved**: current rejects for mixed-pure, shorthand, nested array, and
  nested object property values in expression-statement discard.
- **Rejected**: field-only evaluation without object materialization, hidden
  standalone object allocation in an implementation patch, spread/computed
  key/method/getter/setter support, PromiseLike/thenable assimilation, and
  scheduler/runtime changes.
- **Regression**: none; this is a doc-only boundary decision and the existing
  fail samples continue to pin the current behavior.
- **Future work**: introduce an ephemeral materialization descriptor as the
  first implementation slice if the broader statement-discard object literal
  surface becomes the next priority.
