# 0648 — Postfix update target refs for snapshots

- **Status**: Accepted
- **Date**: 2026-07-20
- **Phase**: 5.181

## Context

[0635](./0635-prefix-update-snapshot-leaves.md) kept postfix updates out because
their old expression value and new target value need separate treatment.
[0638](./0638-array-interface-postfix-update-leaves.md) established
old-value-yielding helpers for safe array and interface targets. Most recently,
[0647](./0647-update-target-ref-prefix-snapshots.md) introduced the
update-owned descriptor seam but deliberately left call-shaped postfix targets
deferred.

## Decision

Reuse `UpdateTargetRef` metadata for postfix snapshot leaves, while lowering
their store through a distinct helper. The helper reads the old value, computes
and writes the next value, then yields the old value into the snapshot frame.
Descriptor receiver and array-index captures still run in source order before
the next suspension, so side effects are neither replayed nor reordered.

Prefix and postfix remain separate value-semantic paths even though they share
target metadata. Rejected alternatives: exposing `AssignmentTargetRef` as the
update descriptor would hide the old/new distinction; a general expression
decomposition IR would exceed this slice; changing runtime or setter ABIs is
unnecessary because statement-expression lowering already preserves both
values.

## Implementation

- `src/codegen.ts:6576` probes and builds update descriptors for both prefix and
  postfix snapshot leaves, while identifier postfix restore remains unchanged.
- `src/codegen.ts:10260` dispatches descriptor-backed snapshots by update kind.
- `src/codegen.ts:10340` writes the next class/interface/array target value and
  returns the captured old value for postfix snapshots.
- `tests/smoke.sh:3182` adds call-shaped class/interface/array coverage and
  promotes the former side-effect index/receiver failures.

## Consequences

- **Accepted**: postfix class/interface fields with await-free call receivers,
  and array elements with await-free call receiver/index expressions.
- **Ordering**: receiver, array index, old-value read, next-value write, and
  following await operand each occur in source order; receiver/index run once.
- **Reject**: target-side await, optional and conditional targets, and unsafe
  non-call receiver/index expressions remain deferred.
- **Regression**: `await_snapshot_postfix_update_target_descriptors` proves old
  expression values and updated target state; three focused failures pin the
  target boundary. Smoke coverage is 738 cases.
- **Scope**: prefix behavior, general IR, runtime, scheduler, PromiseLike /
  thenable behavior, `for await`, loader, and CLI remain unchanged.
