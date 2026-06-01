# 0044. Never return annotation (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0043](./0043-emitter-optional-state-initializers.md) moved the full graph
self-host probe to `src/codegen.ts:634:74`, where the helper
`unsupported(...): never` failed as `unsupported type (type_ref)`. Compiler
helpers such as `unsupported` and `die` use TypeScript's `never` return
annotation to keep callers type-friendly, but Topaz only needs to preserve that
annotation as "this call produces no value".

## Decision

Lower `type_ref` name `never` to the existing no-value `T_VOID` representation
in the type machine. This accepts `never` in function, method, and fn return
slots through the same paths that already accept `void`, while existing
`assertNotVoid` and value-position gates keep it out of variables, parameters,
fields, containers, union variants, and expression values.

Rejected alternatives: adding a distinct bottom type would require
assignability, call inference, control-flow / reachability behavior, and C
return spelling choices that are broader than the blocker; rewriting helpers to
return `void` would fight TypeScript source ergonomics; treating `never` as a
real value type would violate the current no-value invariant.

## Implementation

- `src/codegen.ts:3240` resolves `type_ref` name `never` to `T_VOID` alongside
  the existing primitive keyword refs.
- `src/convert_from_tsc.ts:1321` keeps the parser oracle aligned by converting
  TypeScript `NeverKeyword` nodes to the same `type_ref` shape.
- `examples/never_return_annotation.ts` covers a `never`-annotated function and
  a statement-position call.
- `examples/never_call_value_fail.ts` covers value-position rejection through
  the existing `void` no-value diagnostic.

## Consequences

- **Accepted**: `function fail(message: string): never { ... }` style helpers
  compile, and calls are valid as expression statements.
- **Rejected**: `never` has no value representation; parameters, variables,
  fields, containers, union variants, and call results in value position still
  reject with the existing `void`-style no-value diagnostics.
- **Regression**: `never_return_annotation` and `never_call_value_fail`.
  `tests/smoke.sh` now contains 266 cases.
- **Scope outside**: Topaz does not gain bottom-type assignability,
  reachability analysis, or "always exits" narrowing in this step.
- **Next blocker**: the old `unsupported(...): never` blocker is gone. The full
  graph probe now reaches `src/loader.ts:100:1` and stops with
  `redeclaration of function 'posToLineCol'`.
