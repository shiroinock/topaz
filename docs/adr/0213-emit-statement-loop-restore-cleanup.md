# 0213. emitStatement loop restore cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

Phase 179 moved the full-graph self-host probe to `src/codegen.ts:5424:7`,
where the `while_stmt` branch in `emitStatement` declared `let body: string`
before assigning it inside a `try` block. The adjacent `do_while_stmt` branch
used the same uninitialized local and `try/finally` restore pattern.

Topaz requires initialized local declarations and intentionally keeps `finally`
unsupported. [ADR 0134](./0134-monomorph-scope-restore-without-finally.md) and
the related restore cleanups established that compiler-source emitter state can
be restored on the normal path because a codegen error aborts the current
compile.

## Decision

Normalize only the `emitStatement` `while_stmt` and `do_while_stmt` branches to
initialize the emitted body directly from `emitStatementAsBlock`, then restore
the loop context immediately after successful body emission.

Rejected alternatives: adding `finally` lowering was rejected because this phase
is a compiler-source cleanup, not a language-feature step. Changing loop
semantics, `emitForStatement`, other loop helpers, or `pushLoopCtx` /
`popLoopCtx` was rejected because the self-host blocker is limited to these two
statement branches.

## Implementation

- `src/codegen.ts:5423-5426` emits the while body into a `const body`, restores
  the loop context on the normal path, and preserves the existing
  `while (${cond}) ${body.trimStart()}` formatting.
- `src/codegen.ts:5432-5435` applies the same initialized-body and normal-path
  restore pattern to do-while while preserving the existing
  `do ${body.trimStart()} while (${cond});` formatting.

## Consequences

- **Accepted**: while and do-while emission keep the same C text on successful
  codegen.
- **Accepted**: `break` / `continue` checks in the loop body still see the loop
  context during normal body emission.
- **Rejected**: `finally` support and broader loop-emission cleanup remain out
  of scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by existing while, do-while, and loop smoke cases plus the
  full self-host probe.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5424:7` uninitialized loop-body
  blocker and now stops at `src/codegen.ts:5474:17`: `type mismatch: expected
  topaz_class_anon_148, got
  topaz_dunion_anon_33_or_anon_34_or_anon_35_or_anon_36_or_anon_37_or_anon_38_or_anon_39_or_anon_40_or_anon_43_or_anon_45_or_anon_46_or_anon_48_or_anon_49_or_anon_79_or_anon_80_or_anon_81`.
