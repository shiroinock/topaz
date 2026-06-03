# 0179. arrow helper expected type cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0178](./0178-function-emission-restore-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:3937:24`, where `inferArrowType` used the
truthy optional pattern `expectedType && expectedType.kind === "fn"`. The
adjacent `emitArrowFunction` helper used the same expected-fn setup, and
`inferCallbackFn` still had helper-local source shapes that are outside the
current Topaz subset: optional annotation truthiness, indexed non-null
assertions, full union nodes as diagnostic anchors, and a `try/finally` around
expression-bodied callback inference.

## Decision

Clean up the arrow helper cluster without changing arrow typing or lowering
semantics. Expected function types are now derived through explicit
`undefined` and `kind === "fn"` checks into a `FnType | undefined` local, and
annotation presence checks use explicit local `!== undefined` narrowing.
Minimal `{ pos }` anchors carry diagnostics and annotation conversion, indexed
reads no longer use non-null assertions after arity checks, and callback
expression-body inference pops its temporary scope on the normal path.

Rejected alternatives: adding truthy/falsy narrowing or optional truthiness is
broader type-system work and contradicts strict-boolean source rules; changing
arrow contextual typing would expand the behavior surface; patching only the
first failing line would leave the adjacent arrow helper patterns as immediate
sequential blockers.

## Implementation

- `src/codegen.ts:3936` through `src/codegen.ts:3974` update
  `inferArrowType` to use explicit expected-fn narrowing, local annotation
  checks, initialized temporaries, and minimal anchors.
- `src/codegen.ts:3988` through `src/codegen.ts:4067` update
  `inferCallbackFn` with callback-local anchors, local body / return annotation
  narrowing, non-null assertion removal, and normal-path scope pop.
- `src/codegen.ts:4169` through `src/codegen.ts:4227` apply the same
  expected-fn, annotation, indexed-read, and anchor cleanup to
  `emitArrowFunction`.

## Consequences

- **Accepted**: expected function types still supply arrow parameter and return
  types exactly as before.
- **Accepted**: arity, duplicate parameter, void / nested fn, and block-bodied
  callback diagnostics remain.
- **Accepted**: expression-bodied callback return inference still pushes a
  temporary scope and pops it when inference returns normally.
- **Rejected**: no truthy/falsy narrowing, callback block return inference, or
  arrow contextual typing change is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3937:24` strict-boolean mismatch and
  now stops at `src/codegen.ts:4079:32` because `new Error` is unsupported in
  `emitFnTypedef`.
