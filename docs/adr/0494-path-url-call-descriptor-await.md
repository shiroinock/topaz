# 0494 - path / URL call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.27

## Context

ADR [0493](./0493-flat-builtin-call-descriptor-await.md) moved pure global
parser builtins onto descriptor-backed ordinary call plans so call-argument
await lowering could reuse the same parameter and return metadata as non-await
emit / infer paths. The next narrow builtin group is the pure path / URL helper
set with fixed or optional arity: `dirname(path)`, `basename(path, ext?)`,
`extname(path)`, and `fileURLToPath(url)`. These helpers already return
`string`, already have stable check / emit helpers, and remain call-site-only
names rather than first-class function values.

## Decision

Extend the flat builtin descriptor family with `path_dirname`,
`path_basename`, `path_extname`, and `url_file_url_to_path`. Each descriptor
keeps the existing arity and string-argument checks, records the fixed or
optional parameter list, returns `string`, and emits by delegating to the
existing path / URL helper lowering. Rejected alternatives: adding path / URL
branches to `tryBuildCallArgAwaitExpression` would bypass the ordinary call
descriptor frontier; forcing variadic `resolve` / `join` through a fake
fixed-param descriptor was rejected because those helpers deserve a separate
variadic descriptor shape.

## Implementation

- `src/codegen.ts:197` adds descriptor kinds for the fixed/optional path and
  URL helpers alongside the existing parser flat builtin kinds.
- `src/codegen.ts:11645` extends `resolveFlatBuiltinCallPlan(...)` for
  `dirname`, `basename`, `extname`, and `fileURLToPath`, preserving the existing
  helper diagnostics and `string` return type.
- `src/codegen.ts:11718` keeps deferred flat builtin names such as `resolve` and
  `join` on the shared unsupported await-lowering path instead of reporting an
  older unknown-identifier diagnostic under call-argument await.
- `src/codegen.ts:12062` emits the new descriptors through
  `emitNodePathDirname(...)`, `emitNodePathBasename(...)`,
  `emitNodePathExtname(...)`, and `emitNodeUrlFileURLToPath(...)`.
- `src/codegen.ts:12390` and `src/codegen.ts:14922` route non-await emit and
  value-position type inference through the same flat builtin descriptor plan.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  class methods, and anonymous async function expressions can use one direct
  awaited argument in `dirname(await p)`, `basename(path, await ext)`,
  `extname(await p)`, and `fileURLToPath(await url)` for declaration
  initializers, terminal returns, and expression statements whose result is
  discarded.
- **Preserved**: path / URL helper names remain call-site-only and continue to
  reject first-class value reads with the existing unknown-identifier behavior.
- **Deferred**: variadic path helpers stay outside this phase; `resolve(await
  segment)` and `join(await segment)` still report the shared unsupported await
  lowering diagnostic.
- **Deferred**: fs/process/Promise builtins remain separate because they carry
  effect metadata, `never` / void stream behavior, options-literal policy, or
  scheduler / thenable semantics.
- **Regression**: `examples/async_await_path_url_call_arg.ts` covers
  declaration initializer, async arrow, async method, anonymous terminal return,
  discard statement, resume ordering, and `.then` observers after completion.
- **Regression**: `examples/await_call_arg_path_variadic_deferred_fail.ts` pins
  variadic path helper await as deferred.
- **Regression count**: the smoke suite now has 446 explicit run entries.
- **Scope outside**: nested path / URL arguments, multiple awaits, optional /
  element / constructor calls, assignment await, control-flow await, general
  expression decomposition, local capture across await, Promise rejection
  handlers, PromiseLike / thenable assimilation, and scheduler work remain
  deferred.
