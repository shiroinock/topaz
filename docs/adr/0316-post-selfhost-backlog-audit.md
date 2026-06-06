# 0316 - post-selfhost backlog audit

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.3a

## Context

Phase 2.3 originally bundled generic method/interface support, generic function
`Array<T>` monomorph collection, and `finally` cleanup work into one backlog
line. The current self-host probe,
`node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`,
succeeds at `cd5446604274bb4fcbc3e9fd11f2b125969b08b8`, so there is no
emergent compiler blocker forcing an implementation phase.

The old wording was also stale. [0292](./0292-minimal-try-finally-lowering.md)
already landed minimal no-catch `try/finally` with positive smoke coverage, so
the remaining exception backlog is narrower: `try/catch/finally` and control
flow through `finally` cleanup dispatch. Generic method and generic interface
support still cross parser/bridge, monomorph storage, and vtable shape design.

## Decision

Split Phase 2.3 into explicit follow-ups. `2.3a` is this docs-only backlog
audit. `2.3b` is the next implementation candidate, but it must first add or
identify a concrete positive or fail sample for a generic function returning
`Array<T>`; if no missing path can be reproduced, the worker should document
that the path is already covered instead of changing code. `2.3c` is a
design-only pass for generic methods and generic interfaces. `2.3d` is a
design-only pass for `try/catch/finally` and `return` / `break` / `continue`
through `finally`.

Rejected alternatives: keeping one broad `2.3` item was rejected because it
mixes an audit, a possible small monomorph sample, and two larger design
problems. Implementing generic methods, generic interfaces, or new
`try/finally` control-flow behavior in this phase was rejected because the
self-host probe is green and the required designs are not fixed here. Treating
no-catch `try/finally` as missing was rejected because [0292](./0292-minimal-try-finally-lowering.md)
already covers it.

## Implementation

- `MEMO.md:224` narrows the old 1.5-X backlog to the remaining
  `try/catch/finally` and cleanup-dispatch work.
- `MEMO.md:237` marks `2.3a post-selfhost backlog audit` complete and records
  the `2.3b` through `2.3d` follow-up order.
- `MEMO.md:279` updates the short action list so the next phase starts with a
  concrete `Array<T>` monomorph sample scout.
- No `src/`, `runtime/`, `examples/`, or `tests/smoke.sh` files changed.

## Consequences

- **Accepted**: Phase 2.3 is now an ordered backlog rather than a single broad
  implementation bucket.
- **Accepted**: the recommended next phase is `2.3b`, starting from a concrete
  generic function `Array<T>` monomorph sample or stopping at a design gate if
  no gap can be reproduced.
- **Rejected**: this phase does not implement generic methods, generic
  interfaces, `try/catch/finally`, or control-flow cleanup dispatch.
- **Regression**: `pnpm run build` and `pnpm test` cover unchanged behavior.
- **Scope out**: implementation briefs for `2.3b`, `2.3c`, and `2.3d` remain
  future work.
