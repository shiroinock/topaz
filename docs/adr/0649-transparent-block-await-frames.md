# 0649 — Transparent block await frames

- **Status**: Accepted
- **Date**: 2026-07-20
- **Phase**: 5.182

## Context

[0473](./0473-async-frame-await-lowering.md) established one durable frame and
one output Promise per async invocation, but kept await inside nested blocks out
of scope. [0483](./0483-initializer-expression-await-lowering.md) and
[0490](./0490-expression-statement-await.md) widened the accepted top-level
statement forms without changing that ownership model. After the descriptor
work through [0648](./0648-postfix-update-target-ref-snapshots.md), the next
syntax gap was placement inside lexical blocks rather than target or value
materialization.

## Decision

Treat `block_stmt` as a transparent lexical container during async-frame
discovery and emission. A DFS statement cursor records each non-block statement
with its lexical block path. Suspension steps and ordinary local captures carry
that path, and each continuation recreates the active braces and scope frames
before restoring only locals visible at that path. Frame fields use a
statement-index-derived name so shadowed source bindings remain distinct.

Rejected alternatives: flattening block AST nodes into the parent statement
list would leak bindings and break shadowing; making each block a nested async
function or Promise chain would split frame-owned identity; a general
control-flow continuation IR is larger than this lexical-container slice.

## Implementation

- `src/codegen.ts:5541` builds path-aware DFS statement cursors and keeps
  `if`/loop/try statements opaque.
- `src/codegen.ts:5573` analyzes the existing await forms while pushing and
  popping lexical scope along cursor paths.
- `src/codegen.ts:10176` emits the pre-suspension prefix inside recreated block
  paths without changing Promise scheduling.
- `src/codegen.ts:10869` transitions emitted braces and compiler scope frames;
  `src/codegen.ts:10911` restores only path-visible captures and bindings.
- `tests/smoke.sh:3183` adds positive cross-surface ordering/scope coverage and
  focused block-leak and loop-boundary failures.

## Consequences

- **Accepted**: recursively nested transparent blocks in async functions,
  arrows, methods, and function expressions, using the await statement forms
  already accepted at async-body level.
- **Scope**: pre-await block locals survive later suspension inside that block,
  shadowed names use separate frame fields, and block locals remain unknown
  after the block.
- **Reject**: await in `if`, loops, `switch`, conditional/short-circuit
  expressions, and general control-flow bodies remains deferred; try/catch/
  finally keeps its dedicated deferred diagnostic.
- **Regression**: `async_await_transparent_block` plus two focused failures raise
  smoke coverage to 741 cases; existing if and try failures continue to pass.
- **Scope out**: runtime, scheduler, Promise ABI, thenables, parser, loader, CLI,
  and general expression decomposition are unchanged.
