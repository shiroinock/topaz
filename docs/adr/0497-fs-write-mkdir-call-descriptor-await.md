# 0497 - fs write / mkdir call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.30

## Context

ADR [0496](./0496-fs-read-metadata-call-descriptor-await.md) moved
value-returning filesystem reads and metadata probes onto the flat builtin
descriptor frontier. The remaining small fs step is void-returning mutation:
`writeFileSync(path, content)` and `mkdirSync(path, { recursive: true })`.
They already have stable call-site-only diagnostics and runtime lowering, but
call-argument await must preserve Topaz's void value-use boundary and the exact
mkdir options-literal contract. Builtin effect provenance remains owned by
`src/builtin_descriptors.ts`.

## Decision

Extend flat builtin descriptors to `writeFileSync` and `mkdirSync` only for
statement/discard position. `writeFileSync` exposes honest `path: string` and
`content: string` params, while `mkdirSync` keeps its options as a syntactic
`{ recursive: true }` literal and exposes only the `path: string` await temp
metadata after `checkNodeFsMkdirSyncArgs(...)` has validated the original call.
Rejected alternatives: modeling mkdir options as a boolean or runtime object
would lie about the accepted surface; accepting `mkdirSync(path, await opts)`
would generalize the literal contract; adding fs branches to
`tryBuildCallArgAwaitExpression(...)` would bypass the shared descriptor model.
Exec/process/Promise builtins remain separate because they carry process-spawn,
`never` / stream, or scheduler / thenable semantics.

## Implementation

- `src/codegen.ts:211` adds `fs_write_file_sync` and `fs_mkdir_sync` to the
  synthetic call descriptor kind list.
- `src/codegen.ts:5077` lets the `fs_mkdir_sync` descriptor skip the generic
  await-argument arity check because the original checker already validated two
  args and the descriptor only exposes the path temp metadata.
- `src/codegen.ts:11757` extends `resolveFlatBuiltinCallPlan(...)` with
  `writeFileSync`, reusing `checkNodeFsWriteFileSyncArgs(...)` and returning
  `void`.
- `src/codegen.ts:11768` adds `mkdirSync`, reusing
  `checkNodeFsMkdirSyncArgs(...)`, preserving the options literal, and returning
  `void`.
- `src/codegen.ts:12155` emits both descriptors through the existing
  `emitNodeFsWriteFileSync(...)` / `emitNodeFsMkdirSync(...)` helpers.
- `src/builtin_descriptors.ts` remains the source of fs write effect
  provenance and manifest/explain metadata.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async class
  methods, and anonymous async function expressions can discard
  `writeFileSync(await path, content)`, `writeFileSync(path, await content)`,
  and `mkdirSync(await path, { recursive: true })`.
- **Preserved**: both helpers return `void`; value-position
  `const r = writeFileSync(await path, content)` / mkdir variants still reject.
- **Preserved**: mkdir options remain the syntactic object literal
  `{ recursive: true }`; options are not a normal runtime parameter or awaited
  value.
- **Preserved**: fs helper names remain call-site-only and cannot be used as
  first-class function values.
- **Deferred**: `mkdirSync(path, await opts)`, exec/process/Promise builtins,
  nested fs arguments, multiple awaits, assignment await, general expression
  decomposition, local capture across await, Promise rejection handlers,
  PromiseLike / thenable assimilation, and scheduler work remain outside this
  phase.
- **Regression**: `examples/async_await_fs_write_mkdir_call_arg.ts` covers the
  four accepted async surfaces, pre-await side effects, post-resumption fs
  mutations, and `.then` observers.
- **Regression**: `examples/await_call_arg_fs_write_deferred_fail.ts` now pins
  value-position write await on the existing void value-use diagnostic.
- **Regression count**: the smoke suite now has 451 explicit run entries.
