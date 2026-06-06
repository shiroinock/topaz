# 0319 - try/finally cleanup dispatch

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3d

## Context

[0014](./0014-try-body-return.md) solved ordinary `try/catch` body `return`
by evaluating the return value while the Topaz try frame is live, popping live
frames, and then returning. That decision explicitly did not solve `finally`.
[0292](./0292-minimal-try-finally-lowering.md) later accepted minimal no-catch
`try { ... } finally { ... }` for normal and throw paths, but scoped out
`try/catch/finally` plus `return`, `break`, and `continue` through a finally
boundary.

The current regression surface matches that boundary: `try_finally` is a
positive smoke case, while `try_finally_return_fail` and
`try_catch_finally_fail` keep return-through-finally and catch+finally blocked.
The compiler also still rejects break/continue exits from ordinary try bodies
because those exits would skip `topaz_try_pop()`.

## Decision

Use an explicit cleanup-dispatch model for every active finally boundary rather
than adding isolated special cases. Each boundary owns generated dispatch state:
a `reason` value with variants `normal`, `throw`, `return`, `break`, and
`continue`; a typed return temporary when the current function returns a value;
the existing `topaz_throw_value` / class-instance pointer for throws; and future
break/continue label targets owned by the enclosing loop or switch context.

Lowering enters `try/finally` or `try/catch/finally` by pushing a cleanup
context. A control-flow exit inside the protected region stores its
reason/payload, pops any live Topaz try frame that would otherwise be skipped,
and jumps to the generated cleanup label instead of directly returning,
breaking, continuing, or propagating a throw. The cleanup label runs the finally
body exactly once. A dispatch tail then resumes the stored reason: `normal`
falls through, `throw` rethrows, `return` returns the stored value or performs a
bare return for `void`, and `break` / `continue` jump to the stored labels in a
later implementation phase. A throw from the finally body keeps the existing
override semantics and replaces the pending reason immediately.

Rejected alternatives: implementing only `try/catch/finally` first was rejected
because catch-body throws and future returns still need cleanup dispatch.
Implementing only no-catch `try/finally` return first without a shared model was
rejected because it would duplicate the return-only strategy from ADR 0014 and
make catch+finally harder to integrate. Directly using C `goto` from every exit
site to the final destination with manually inlined cleanup was rejected because
nested finally blocks need a uniform reason/payload chain. Treating return,
break, and continue as Topaz exceptions was rejected because Topaz exception
values are class instances only and these control-flow exits are not language
exceptions.

## Implementation

- `MEMO.md` marks 2.3d complete as a design phase and records the follow-up
  implementation order.
- This ADR is documentation-only; no compiler, runtime, examples, smoke tests,
  or package metadata changed.
- 2.3d-1 will enable return through no-catch `try/finally` while keeping
  break/continue, return from finally body, and `try/catch/finally`
  unsupported.
- 2.3d-2 will enable `try/catch/finally` normal and throw dispatch, including
  catch-body throws running finally before propagation.
- 2.3d-3 will add break/continue cleanup labels for exits from protected
  regions.

## Consequences

- **Accepted**: cleanup dispatch is the shared model for normal completion,
  throw, return, break, and continue through finally boundaries.
- **Accepted**: finally-body throw continues to override any pending cleanup
  reason.
- **Rejected**: one-off return-only lowering for `try/finally` is not the
  architectural direction, even though return is the first implementation
  target.
- **Rejected**: `try/catch/finally` does not land until normal/throw dispatch
  is implemented and tested.
- **Scope out**: break/continue labels and label-target ambiguity checks are
  deferred to 2.3d-3.
- **Regression**: no examples or smoke cases were added because this phase is
  documentation-only and does not claim implementation support.
