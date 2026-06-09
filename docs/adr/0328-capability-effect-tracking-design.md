# 0328 - capability effect tracking design

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.0

## Context

Phase 2 fixed the first public stdlib direction in
[0313](./0313-stdlib-surface-design.md) and the first async/fiber direction in
[0327](./0327-fiber-async-await-design.md). The next expansion point cuts
across `throw`, async scheduling, `std/fs`, `std/process`, package boundaries,
and future WASI hosts, so Topaz needs a design vocabulary before those
surfaces grow independently. This phase records that design only; it does not
add parser syntax, typechecker behavior, stdlib metadata, package manifest
checks, or runtime enforcement.

## Decision

Topaz functions conceptually have two static components: a return type and an
effect set. An effect is a compile-time atom describing what a call may do.
Initial atom families are `throw<E>` for thrown class-instance error types;
`fs.read`, `fs.write`, and `fs.metadata` for filesystem operations;
`process.argv`, `process.exit`, `io.stdout`, and `io.stderr` for process and
console-like operations; and `async.schedule` for scheduler/fiber interaction
once async exists. Effects describe what code requires, while capabilities are
permissions granted by the host or package manifest to discharge those effects
at program and package boundaries.

Effect sets use inclusion. A function requiring fewer effects can be used
where those fewer effects are expected, but a function requiring more effects
cannot be silently passed into a purer context. Effects should be inferred
through calls first, with user-facing effect annotation syntax deferred. The
notation `!{ fs.read, throw<E> }` is only illustrative for now and is not
accepted syntax.

`throw` is tracked as an effect rather than treated as a hidden control-flow
escape. `catch` can remove or narrow `throw<E>` only when handled class types
are statically known; uncaught or unknown throws remain in the enclosing
function effect set. Async does not erase effects: ADR 0327 remains valid, and
a later async implementation must decide how promise values carry or expose
body effects without changing behavior in this design phase.

Rejected alternatives: Effect-TS style type-level encoding as the primary
implementation model was rejected because Topaz should own this in the
compiler subset instead of relying on TS-level encodings; runtime-only
capability tokens were rejected because they cannot propagate call requirements
statically; manifest-only permission checks were rejected because they miss
function-level purity boundaries; syntax-first `!{ ... }` implementation was
rejected until inference and stdlib metadata are designed; a single opaque
`impure` bit was rejected because it would collapse `throw`, async scheduling,
filesystem, process, and console effects into one unusable category.

## Implementation

- `MEMO.md` records Phase 3.0 as complete and points the roadmap at this ADR.
- Future stdlib declarations should attach effect metadata to imports such as
  `std/fs` and `std/process`.
- Future package manifests should grant or deny capabilities at entrypoints and
  package boundaries.
- No `src/`, `runtime/`, parser bridge, examples, smoke tests, package
  metadata, or manifest behavior is changed by this ADR.

## Consequences

- **Accepted**: later implementation phases should infer call effects, model
  `throw<E>` precisely enough for known `catch` clauses, and connect stdlib
  effects to package or host capabilities.
- **Rejected**: no product syntax for `!{ ... }`, no TypeScript bridge
  conversion for effect notation, no runtime capability-token surface, and no
  manifest enforcement are introduced here.
- **Regression**: no new examples or smoke entries; this phase is design-only
  and relies on the existing `pnpm run build` and `pnpm test` gates.
- **Scope out**: async body-effect representation, WASI capability mapping,
  concrete manifest schema, stdlib declaration format, and user-facing
  annotation syntax remain follow-up decisions.
