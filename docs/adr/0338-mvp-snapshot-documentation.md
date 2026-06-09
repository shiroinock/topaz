# 0338 - MVP snapshot documentation

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.10

## Context

[0337](./0337-single-binary-mvp-ux-gate.md) made the README and CLI help
accurately describe the single-binary MVP boundary. The next validation path is
to hand a tester only a binary artifact and documentation and see whether they
can use Topaz correctly. README is a good entrypoint, but a black-box tester
needs a fuller snapshot of the MVP surface, including the distinction between
"Topaz generates one native binary" and "the Topaz compiler itself is shipped as
one native binary".

## Decision

Add `docs/mvp.md` as the MVP handoff document. It defines the MVP, documents the
compiler invocation in this checkout, gives a minimal `std/process` hello-world,
lists the public stdlib and minimal package lookup rules, records important
language boundaries, and includes a black-box usage checklist. A sub-agent
black-box probe is used to validate that binary-only recipients understand the
handoff. Rejected alternatives: expanding README into the full snapshot was
rejected because the README should remain an entrypoint; documenting standalone
compiler distribution as complete was rejected because the current compiler CLI
is still Node-based; adding new compiler semantics was rejected because this
phase is documentation and validation only.

## Implementation

- `docs/mvp.md:1` adds the full MVP snapshot.
- `docs/mvp.md:17` states that generated programs are native binaries while the
  compiler command in this checkout remains Node-based.
- `docs/mvp.md:20` adds the binary-only validation path.
- `docs/mvp.md:53` gives a minimal `std/process` hello-world compile/run flow.
- `docs/mvp.md:87` lists the supported import surface.
- `docs/mvp.md:127` documents minimal package lookup accepts and rejects.
- `docs/mvp.md:180` adds the black-box usage checklist.
- `README.md:65` links to the MVP snapshot.

## Consequences

- **Accepted**: external testers can receive one focused MVP document instead
  of reconstructing the current boundary from README, MEMO, and ADRs.
- **Accepted**: the docs explicitly avoid implying that the compiler itself is
  already a standalone native binary.
- **Rejected**: no compiler behavior, stdlib surface, package lookup rule, or
  runtime behavior changes are included.
- **Validation**: run `pnpm run build`, `pnpm test`, build a simple generated
  binary, and hand the binary plus `docs/mvp.md` to a sub agent for black-box
  feedback. The probe confirmed the binary runs as a Mach-O arm64 executable
  with no Node.js dependency and drove the binary-only wording above.
