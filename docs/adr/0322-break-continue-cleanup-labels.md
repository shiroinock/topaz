# 0322 - break/continue cleanup labels

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3d-3

## Context

[0319](./0319-try-finally-cleanup-dispatch.md) fixed cleanup reasons for
`normal`, `throw`, `return`, `break`, and `continue`. [0320](./0320-try-finally-return-dispatch.md)
implemented direct no-catch `try/finally` returns, and
[0321](./0321-try-catch-finally-dispatch.md) implemented catch+finally
normal/throw cleanup. The remaining no-catch gap was `break` / `continue`
inside a protected region: direct C control flow would skip the live
`topaz_try_frame` pop and the finally body.

## Decision

Support unlabeled `break` and `continue` that escape a no-catch `try/finally`
protected region. Loop and switch emission contexts now optionally carry C
label targets. When an escaping `break` or `continue` is emitted under an
active cleanup context, codegen stores reason `3` or `4`, stores a per-kind
target index, pops frames opened inside the protected region, and jumps to the
cleanup label. After the finally body, the dispatch tail jumps to the indexed
break or continue label.

Rejected alternatives: always emitting loop/switch labels was rejected because
warning-free gates catch unused labels. Treating every break/continue under an
active context as escaping was rejected because loops/switches created inside
the try body should keep ordinary local control flow. Labeled break/continue
and break/continue through `try/catch/finally` remain deferred.

## Implementation

- `src/codegen.ts:668` extends `LoopCtxFrame` and the active cleanup context
  with optional break/continue labels and target lists.
- `src/codegen.ts:5582` and `src/codegen.ts:6946` add label-aware while,
  do-while, and for emission, placing continue labels before the natural
  update/check point and break labels after the statement.
- `src/codegen.ts:7246`, `src/codegen.ts:7330`, and `src/codegen.ts:7420`
  add the same label targets for array, hash, and iterator for-of lowering.
- `src/codegen.ts:7573` gives switch an optional break exit label while
  preserving the existing `continue`-inside-switch rejection.
- `src/codegen.ts:5983` dispatches cleanup reasons `3` and `4` to the
  captured target indexes after the finally body.
- `src/codegen.ts:6164` limits label emission to loops/switches that actually
  contain a no-catch `try/finally` escape, keeping existing warning-free
  samples quiet.
- `src/codegen.ts:7673` emits break/continue either directly or through the
  active cleanup context depending on whether the target is outside the
  protected-region loop boundary.

## Consequences

- **Accepted**: no-catch `try/finally` try-body `break` and `continue` can
  escape while, do-while, for, for-of, and switch-break targets after running
  finally exactly once.
- **Rejected**: `continue` inside `switch` remains unsupported because switch
  still lowers to `do/while(0)`.
- **Rejected**: `try/catch/finally` return/break/continue and nested active
  finally break/continue remain unsupported.
- **Regression**: `try_finally_break_continue`,
  `try_catch_finally_break_fail`, and `try_finally_switch_continue_fail` bring
  the smoke matrix to 296 cases.
