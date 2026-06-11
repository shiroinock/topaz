# 0427 - public explain capability CLI

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.9

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) reserved
`topaz explain capability <name>` as embedded documentation for capability
names. ADRs [0418](./0418-builtin-effect-inventory.md) through
[0426](./0426-public-doctor-cli.md) established descriptor-backed effect
vocabulary, provenance, doctor rendering, and the public read-only doctor
entrypoint. The next small public guidance surface is explaining one existing
capability atom without loading a source graph or introducing policy.

## Decision

Add `explain capability <name>` as a command-position subcommand. It renders
only existing builtin descriptor metadata: a stable capability heading, a short
description, and every descriptor that requires the capability, including
specifier/name or synthetic global, semantic name, status, and descriptor
explanation. Unknown names fail with a `topaz:` diagnostic and the known names
in vocabulary order. Rejected alternatives: `topaz check`, `manifest init`,
`explain std/<module>`, manifest schema/parsing/writing, compile-time
permission rejection, runtime sandboxing, new effect atoms, broad function
effect propagation, package lookup changes, and runtime prelude/header changes
remain out of scope because this phase only exposes read-only capability docs.

## Implementation

- `src/builtin_descriptors.ts:26` exposes the seeded capability vocabulary and
  `src/builtin_descriptors.ts:39` adds short descriptions for those existing
  atoms.
- `src/capability_explain.ts:9` finds known capabilities from descriptors,
  `src/capability_explain.ts:17` formats the public explanation, and
  `src/capability_explain.ts:50` orders descriptor rows by public, compat, then
  synthetic compatibility status.
- `src/cli.ts:15` updates usage text with `topaz explain capability <name>`.
- `src/cli.ts:134` parses the explain subcommand, rejects compile-only flags
  with `topaz:` diagnostics, and avoids source loading or compilation.
- `src/cli.ts:170` dispatches `explain` only in command position, preserving
  normal compile behavior and the existing `doctor` command.
- `tests/smoke.sh:539` keeps help coverage current, and
  `tests/smoke.sh:598` covers known capability output, unknown capability
  failure, missing-name failure, compile-only flag rejection, and the existing
  compile smoke.
- `MEMO.md:341` records the Phase 4.9 public explain capability checkpoint.

## Consequences

- **Accepted**: users and sub agents can discover what capability atoms mean
  and which builtin APIs introduce them without external docs.
- **Accepted**: pure helpers such as `path.resolve` remain no-capability
  descriptors and therefore fail as unknown capability names.
- **Accepted**: `explain` is read-only; it does not load the source graph,
  compile, emit C, read or write manifests, or enforce permissions.
- **Rejected**: manifest UX, policy checks, `explain std/<module>`, runtime
  sandboxing, package lookup changes, and effect model expansion remain future
  v0.2 work.
- **Regression**: `pnpm run build` and `pnpm test`.
