# 0039. Loop context linked frames (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0038](./0038-scope-linked-frames.md) removed `Scope`'s nested-container
blocker and moved the full graph self-host probe to `src/codegen.ts:928:20`.
The next blocker was `Emitter.loopCtx: Array<"loop" | "switch">`, a compiler-
internal stack used only to validate `continue` across loop, switch, and arrow
function boundaries. General `Array<dunion>` support remains too broad for this
prep step.

## Decision

Rewrite `loopCtx` as a linked stack of `LoopCtxFrame` objects. Each frame stores
`kind: string` (`"loop"` or `"switch"`) and a `prev` pointer, preserving nearest
enclosing construct semantics without any array monomorph.

Rejected alternatives: adding general `Array<T | U>` support would expand the
language for one internal stack; parallel scalar counters would lose nearest-
frame behavior for loop/switch interleavings unless they rebuilt a stack
indirectly; changing the array to `Array<string>` would hide the literal-union
blocker while keeping the same subset-hostile container shape.

## Implementation

- `src/codegen.ts:585` adds `LoopCtxFrame` with `kind` and `prev`.
- `src/codegen.ts:930` changes `Emitter.loopCtx` from an array to the current
  `LoopCtxFrame | undefined` head.
- `src/codegen.ts:3651` adds `pushLoopCtx`, `popLoopCtx`, `resetLoopCtx`, and
  `restoreLoopCtx` helpers.
- `src/codegen.ts:3782` keeps arrow emission as a function boundary by clearing
  the linked stack for the arrow body and restoring it in `finally`.
- `src/codegen.ts:4539`, `src/codegen.ts:5149`, and `src/codegen.ts:5676`
  route loop and switch emission through the helper stack.
- `src/codegen.ts:5734` preserves the existing diagnostics: no frame rejects as
  `` `continue` outside of a loop ``, and a top `"switch"` frame rejects as
  unsupported because switch lowers to `do/while(0)`.

## Consequences

- **Accepted**: existing loop / switch / arrow `continue` behavior is preserved
  without requiring `Array<dunion>` or nested container support.
- **Rejected**: no user-visible support for `Array<T | U>` or broader generic
  nested containers was added.
- **Regression**: no new example was added because this is source-only compiler
  cleanup; existing loop, switch, for-of, and arrow smoke coverage remains the
  observable gate. `tests/smoke.sh` still contains 257 cases.
- **Next blocker**: the old `loopCtx` blocker is gone. The full graph probe now
  reaches `src/codegen.ts:999:30` and stops on a missing
  `Map<dunion, dunion>` monomorph for `Emitter.moduleGlobalTypes`.
