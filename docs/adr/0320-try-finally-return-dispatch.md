# 0320 - try/finally return dispatch

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3d-1

## Context

[0319](./0319-try-finally-cleanup-dispatch.md) fixed cleanup dispatch as the
shared model for `finally` exits. [0292](./0292-minimal-try-finally-lowering.md)
had already landed no-catch `try/finally` for normal and throw paths, while
[0014](./0014-try-body-return.md) showed why return values must be evaluated
before popping live Topaz try frames. The old `try_finally_return_fail`
coverage kept this gap visible: a `return` in the try body still skipped
finally cleanup and was rejected.

## Decision

Implement only the direct no-catch `try/finally` return subset from ADR 0319.
Each no-catch finally statement owns a cleanup label, a reason temporary, and
when the current function is non-void a typed return temporary. A try-body
`return` evaluates its expression while the current try frame is still live,
stores the value, marks reason `return`, pops frames opened inside the protected
region, and jumps to the cleanup label. The cleanup body then runs exactly once;
the dispatch tail pops ordinary outer try frames still live at the statement
site and returns the stored value or performs a bare return.

Nested active finally return remains explicitly unsupported in this phase.
Rejected alternatives: using the old `popFrames()` return path was rejected
because it would skip finally; popping every live frame at the return site was
rejected because ordinary outer handlers must stay live until cleanup finishes;
supporting nested active cleanup contexts was rejected because it needs the
full reason/payload chain planned after this direct subset.

## Implementation

- `src/codegen.ts:1216` adds the active finally-return context beside
  `liveTryFrames` and resets it at function and arrow boundaries.
- `src/codegen.ts:5479` routes return statements through the active cleanup
  context, storing value payloads before popping protected-region frames.
- `src/codegen.ts:5743` lowers no-catch `try/finally` with reason and return
  temporaries, a cleanup label, and return/throw dispatch after finally.
- `src/codegen.ts:5840` allows try-body returns, keeps finally-body returns
  rejected, and detects nested active finally returns.
- `examples/try_finally_return.ts` replaces the old fail case with positive
  value, void, and throwing-return-expression coverage.
- `examples/try_finally_return_in_finally_fail.ts` and
  `examples/try_finally_nested_return_fail.ts` pin the remaining rejections.
- `tests/smoke.sh:181` adds the positive smoke row and the two fail rows.
- `MEMO.md:241` marks 2.3d-1 complete and records the remaining scope-outs.

## Consequences

- **Accepted**: non-void and void `return` from a no-catch `try/finally` try
  body now run finally before returning.
- **Accepted**: a return expression that throws before the value is committed
  still runs finally and propagates the thrown class instance.
- **Rejected**: `return` from the finally body remains unsupported with a
  context-specific diagnostic.
- **Rejected**: nested active finally return is rejected with
  `nested return through multiple finally cleanup contexts is unsupported`.
- **Scope out**: `try/catch/finally`, `break`, and `continue` through cleanup
  labels remain for later 2.3d follow-ups.
- **Regression**: `try_finally_return`,
  `try_finally_return_in_finally_fail`, `try_finally_nested_return_fail`, and
  the existing `try_catch_finally_fail` / `try_break_fail` rows cover the
  accepted and rejected surface.
