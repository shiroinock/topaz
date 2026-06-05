# 0308 - arrow lexical this capture

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 275

## Context

After [0307](./0307-execfile-stdio-literal-optional-narrowing.md), the full
graph self-host probe emitted C for `src/cli.ts`, but the object gate failed in
arrow helpers generated for compiler methods. Those helpers run as static C
functions with only `void *__topaz_env`; raw `__topaz_this` references are not
in scope unless arrow lowering captures lexical `this`.

## Decision

Model lexical `this` as a pseudo-capture named by the existing `TOPAZ_THIS`
constant and store it in the ordinary arrow env alongside identifier captures.
Direct arrow bodies and nested arrow bodies both bubble `this` into the capture
map when the construction site is inside a class method or constructor, and
body emission reads it through the env when the active capture context contains
the pseudo-capture.

Rejected alternatives: rewriting compiler source arrows to avoid `this` was
rejected because it would dodge required TypeScript arrow behavior; adding a
hidden arrow-helper parameter was rejected because it changes the fn-pointer
ABI while the env already represents lexical captures; treating
`__topaz_this` as a normal scoped identifier was rejected because source
identifiers should not acquire special meaning.

## Implementation

- `src/codegen.ts:4560` special-cases the pseudo-capture during env
  initialization, reading the enclosing method `__topaz_this` directly or
  forwarding it from the outer arrow env.
- `src/codegen.ts:4614` records `TOPAZ_THIS -> classOf(currentClass)` during
  direct arrow capture analysis.
- `src/codegen.ts:4752` reports `this_expr` through a dedicated capture-walk
  callback instead of the normal identifier callback.
- `src/codegen.ts:4842` detects nested-arrow `this`, and
  `src/codegen.ts:4850` forwards it into the outer arrow's capture map.
- `src/codegen.ts:7138` emits `this_expr` inside a capturing arrow body as an
  env field read instead of raw `__topaz_this`.

## Consequences

- **Accepted**: arrows inside methods and constructors may reference `this`,
  including a nested arrow whose outer arrow forwards only lexical `this`.
- **Rejected**: `this` outside class methods or constructors still reports
  `` `this` is only valid inside class methods or constructors ``.
- **Regression**: `arrow_this_capture` covers direct and nested lexical `this`
  capture, and `this_outside_class_fail` covers the preserved diagnostic. The
  suite rises from 287 to 289 smoke entries.
- **Self-host**: the old undeclared `__topaz_this` generated-C blocker is
  removed from arrow helpers without changing ordinary identifier capture
  semantics.
- **Scope out**: broader by-reference closure semantics and hidden arrow
  parameters remain outside this phase.
