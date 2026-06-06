# 0321 - try/catch/finally dispatch

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3d-2

## Context

[0319](./0319-try-finally-cleanup-dispatch.md) fixed explicit cleanup reasons
as the shared model for `finally` exits. [0320](./0320-try-finally-return-dispatch.md)
used that model for no-catch `try/finally` returns, while
[0292](./0292-minimal-try-finally-lowering.md) had only accepted no-catch
normal/throw cleanup. The old `try_catch_finally_fail` smoke case kept the
remaining catch+finally gap visible: even a caught throw followed by finally
was rejected as unsupported.

## Decision

Support `try { ... } catch (e: T) { ... } finally { ... }` for normal
completion and throw propagation only. The try body keeps the ordinary
`topaz_try_frame`; if it throws, the catch binding is created from
`topaz_throw_value`, then the catch body runs under a second protected
`topaz_try_frame`. A throw from the catch body, including a callee throw, marks
the cleanup reason as throw after that catch frame has been popped by
`topaz_throw`. The finally body runs once after either normal path; if the
reason is throw, the stored `topaz_throw_value` is rethrown.

Rejected alternatives: running the catch body unprotected was rejected because
catch-body throws would skip finally. Reusing the no-catch return cleanup
context was rejected for this phase because return/break/continue payloads
through catch+finally need the later full cleanup-label work. Moving this into
runtime helpers was rejected because the lowering already has the exact binding
scope and typed catch information.

## Implementation

- `src/codegen.ts:5655` dispatches catch+finally to a dedicated lowering path
  while preserving ordinary `try/catch` and no-catch `try/finally`.
- `src/codegen.ts:5706` factors catch binding validation/emission so ordinary
  catch and catch+finally share the same class/unknown rules.
- `src/codegen.ts:5752` lowers catch+finally with a try frame, protected catch
  frame, normal/throw cleanup reason, finalizer body, and rethrow tail.
- `src/codegen.ts:5765` rejects `return`, `break`, and `continue` from the
  try and catch bodies before emission, with catch+finally-specific return
  diagnostics.
- `examples/try_catch_finally.ts` replaces the old fail-named sample with
  positive coverage for normal completion, caught try throws, catch throws,
  catch callee throws, and finally override.
- `examples/try_catch_finally_return_fail.ts` and
  `examples/try_catch_finally_catch_return_fail.ts` pin the remaining return
  rejections.
- `tests/smoke.sh:182` adds the positive row and the two catch+finally return
  fail rows.
- `MEMO.md:242` marks 2.3d-2 complete and leaves the remaining cleanup-label
  scope-outs visible.

## Consequences

- **Accepted**: try body normal completion runs finally and falls through.
- **Accepted**: try body throws can be caught, complete the catch body, run
  finally, and fall through.
- **Accepted**: catch-body explicit throws and callee throws run finally before
  propagating the catch/callee throw.
- **Accepted**: a throw from finally overrides any pending handled or
  propagated throw.
- **Rejected**: `return` through a catch+finally try body or catch body remains
  unsupported with specific diagnostics.
- **Scope out**: finally-body return, nested active finally return, and
  break/continue cleanup labels remain for later 2.3d follow-ups.
- **Regression**: `try_catch_finally`,
  `try_catch_finally_return_fail`, and
  `try_catch_finally_catch_return_fail` cover the accepted and rejected
  surface while existing try/catch and no-catch try/finally rows stay active.
