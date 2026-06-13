# 0496 - fs read / metadata call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.29

## Context

ADR [0495](./0495-path-variadic-call-descriptor-await.md) moved variadic path
helpers onto the flat builtin descriptor frontier, but value-returning
filesystem helpers stayed deferred for call-argument await. `readFileSync(path,
"utf8")` and `existsSync(path)` already have stable call-site-only checks,
return `string` / `boolean`, and are the smallest effectful builtin step that
only needs call metadata for await lowering. Builtin effect provenance remains
owned by `src/builtin_descriptors.ts`; this phase must not replace or weaken
that policy surface.

## Decision

Add flat builtin descriptor kinds for `readFileSync` and `existsSync`. The
descriptor calls the existing `checkNodeFsReadFileSyncArgs(...)` /
`checkNodeFsExistsSyncArgs(...)`, exposes `string` params for the path (and
encoding, so path/encoding evaluation order stays explicit), returns the
existing `string` / `boolean` types, and emits through the existing fs helper
lowering. Rejected alternatives: adding fs-specific branches to
`tryBuildCallArgAwaitExpression(...)` would bypass the shared descriptor model;
accepting `readFileSync(path, await encoding)` would weaken the syntactic
`"utf8"` literal contract; folding write/mkdir/exec/process/Promise builtins
into this phase would mix in void mutation, options-literal, process-spawn,
`never` / stream, scheduler, or thenable semantics.

## Implementation

- `src/codegen.ts:209` adds `fs_read_file_sync` and `fs_exists_sync` to the
  synthetic call descriptor kind list.
- `src/codegen.ts:11735` extends `resolveFlatBuiltinCallPlan(...)` with
  `readFileSync`, using `[path: string, encoding: string]` params after the
  existing checker enforces exactly two args and literal `"utf8"`.
- `src/codegen.ts:11746` adds `existsSync` with a single `path: string` param
  after the existing arity / path type checker runs.
- `src/codegen.ts:12123` emits both descriptors through
  `emitNodeFsReadFileSync(...)` / `emitNodeFsExistsSync(...)`, preserving the
  existing runtime calls and diagnostics.
- `src/codegen.ts:14960` keeps non-await value-position inference routed
  through flat builtin descriptors, while `readFileSync` / `existsSync` remain
  absent from scope as first-class function values.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async class
  methods, and anonymous async function expressions can use one direct awaited
  path argument in `readFileSync(await path, "utf8")` and
  `existsSync(await path)` for declaration initializers, terminal returns, and
  expression statements whose result is discarded.
- **Preserved**: `readFileSync` still requires exactly `(path: string,
  encoding: "utf8")`; `existsSync` still requires exactly one `string` path;
  both names remain call-site-only, not first-class values.
- **Preserved**: builtin effect provenance and manifest reporting remain owned
  by `src/builtin_descriptors.ts`.
- **Deferred**: write/mkdir/exec/process/Promise builtins, awaited read
  encoding, nested fs arguments, multiple awaits, assignment await, general
  expression decomposition, local capture across await, Promise rejection
  handlers, PromiseLike / thenable assimilation, and scheduler work remain
  outside this phase.
- **Regression**: `examples/async_await_fs_read_metadata_call_arg.ts` covers
  declaration initializer, async arrow, async method, anonymous terminal return,
  discard statement, pre-await path side effects, fs calls after resumption,
  and `.then` observers after completion.
- **Regression**: `examples/await_call_arg_fs_write_deferred_fail.ts` pins
  write-side fs call-argument await on the shared unsupported lowering
  diagnostic.
- **Regression**: `examples/node_fs_read_file_encoding_await_fail.ts` pins
  awaited encoding on the existing literal `"utf8"` diagnostic.
- **Regression count**: the smoke suite now has 447 explicit run entries.
