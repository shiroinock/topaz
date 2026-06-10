# 0426 - public doctor CLI

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.8

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) fixed
`topaz doctor <entry.ts>` as the read-only guidance doorway, separate from
write-capable `manifest init`, policy `check`, and documentation `explain`.
ADRs [0418](./0418-builtin-effect-inventory.md) through
[0425](./0425-doctor-report-selfhost.md) established the effect vocabulary,
provenance, manifest requirement grouping, and self-hostable doctor report
renderer. The missing user-facing step is a CLI command that exposes the
existing renderer while preserving the zero-config compile path.

## Decision

Add `doctor` as a command-position subcommand:
`topaz doctor <entry.ts>` resolves the entry path, renders
`formatDoctorReportForEntry(...)`, and prints one trailing newline. Normal
`topaz <entry.ts>` compilation, including `-o`, `--emit-c-only`, `--lex-only`,
and the reserved `--parse-only` diagnostic, remains unchanged. Rejected
alternatives: adding manifest schema/parsing/writing, `manifest init`, `check`,
`explain`, compile-time permission rejection, runtime sandboxing, new effect
atoms, broad function effect propagation, package lookup changes, or runtime
prelude/header changes was rejected because this phase only exposes the
read-only doctor doorway.

## Implementation

- `src/cli.ts:8` imports the existing doctor report entry API.
- `src/cli.ts:13` updates the help text to show both compile and doctor usage.
- `src/cli.ts:98` adds the doctor subcommand parser, rejects compile-only flags
  with `topaz:` diagnostics, validates a `.ts` entry, and prints the report.
- `src/cli.ts:130` dispatches to doctor only when `doctor` appears in command
  position, leaving ordinary compile parsing untouched.
- `tests/smoke.sh:534` keeps help coverage green for the new usage block.
- `tests/smoke.sh:551` adds public CLI doctor coverage for effectful output,
  pure `std/path` output, and rejected compile-only flags.
- `MEMO.md:340` records the Phase 4.8 public doctor CLI checkpoint.

## Consequences

- **Accepted**: users and sub agents can ask Topaz why an entry graph needs
  capabilities before any manifest exists.
- **Accepted**: the doctor command is read-only and does not compile, emit C,
  generate native output, read or write manifests, or enforce permissions.
- **Accepted**: `doctor` is now reserved as a command-position word; compiling a
  relative file literally named `doctor` was already outside the supported
  `.ts` entry shape.
- **Rejected**: manifest UX, policy checks, explanation commands, runtime
  sandboxing, package lookup changes, and effect model expansion remain future
  v0.2 work.
- **Regression**: `pnpm run build` and `pnpm test`.
