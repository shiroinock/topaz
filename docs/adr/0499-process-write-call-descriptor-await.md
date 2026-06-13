# 0499 - process write call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.32

## Context

ADR [0498](./0498-child-process-exec-call-descriptor-await.md) completed the
last void-returning child-process helper in the flat builtin descriptor
frontier. The remaining low-risk process family is raw stream writing and the
public `std/process` write helpers: they are already synchronous,
string-only, void-returning, and statement-oriented. The work needs to reuse
their existing diagnostics and `io.stdout` / `io.stderr` descriptor metadata
without pulling in `process.exit`, process member values, or scheduler work.

## Decision

Extend descriptor-backed call-argument await to `process.stdout.write`,
`process.stderr.write`, `writeStdout`, `writeStderr`, and `writeError` only in
statement/discard position. The synthetic property-call and flat-builtin plans
expose one `string` parameter so the existing call-argument await machinery can
replace a direct awaited argument and then emit through the established process
write helpers. Rejected alternatives: adding a bespoke process branch to
`tryBuildCallArgAwaitExpression(...)` would bypass the descriptor frontier;
making write helpers value-producing would violate their existing `void`
contract; including `process.exit` / `exit` would mix in `never` and
control-flow behavior; adding scheduler/task-queue or Promise/thenable semantics
belongs to separate async phases.

## Implementation

- `src/codegen.ts:214` adds synthetic call descriptor kinds for raw process
  stdout/stderr writes and the three public `std/process` write helpers.
- `src/codegen.ts:11631` recognizes `process.stdout.write` and
  `process.stderr.write` as synthetic property-call plans while keeping the
  receiver itself unevaluated as a normal process member value.
- `src/codegen.ts:11819` adds flat builtin plans for `writeStdout`,
  `writeStderr`, and `writeError` with a single string parameter and `void`
  return.
- `src/codegen.ts:11866` keeps `process.exit` in the deferred flat-builtin
  await callee list while allowing the public write helpers to reach their
  descriptors.
- `src/codegen.ts:12232` emits process write descriptors through the existing
  `emitProcessStreamWrite(...)` and `emitStdProcessWriteError(...)` helpers.
- `src/builtin_descriptors.ts` remains the source of `io.stdout` /
  `io.stderr` effect provenance for manifest, check, doctor, and explain
  behavior.
- `examples/topaz_std_process_ambient.d.ts` gives the new sample just enough
  ambient TypeScript shape for the brief-required single-file `tsc` gate.
- `MEMO.md:422` records the phase 5.32 scope and follow-up boundary.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async class
  methods, and anonymous async function expressions can discard one direct
  awaited string argument to raw process stream writes and public
  `std/process` write helpers.
- **Preserved**: raw `process.stdout.write` / `process.stderr.write`,
  `writeStdout`, and `writeStderr` remain byte/raw writes and do not append a
  newline.
- **Preserved**: `writeError` remains line-oriented stderr and appends exactly
  one newline through the existing helper path.
- **Preserved**: value-position writes such as
  `const r = writeStdout(await p)` and
  `const r = process.stdout.write(await p)` still reject on the existing void
  value-use diagnostics.
- **Deferred**: `process.exit` / `exit`, process member values, awaited
  receivers, nested process arguments, multiple awaits in one call, assignment
  await, general expression decomposition, local capture across await, Promise
  rejection handlers, PromiseLike / thenable assimilation, and scheduler/task
  queue semantics remain separate phases.
- **Regression**: `examples/async_await_process_write_call_arg.ts` covers the
  four accepted async surfaces, raw stdout, raw stderr, public stdout/stderr,
  `writeError`, pre-await side effects, stdout output after resumption, and
  `.then` observers after completion.
- **Regression**: `examples/await_call_arg_process_write_deferred_fail.ts`
  pins value-position process-write await on the existing void value-use
  diagnostic.
- **Regression count**: the smoke suite now has 452 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
