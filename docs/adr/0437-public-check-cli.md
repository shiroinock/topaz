# 0437 - public check CLI

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.18

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) reserved
`topaz check <entry.ts>` as the read-only command for validating that an
existing manifest covers inferred requirements. ADR
[0436](./0436-strict-ts-policy-check-evaluator.md) added the path-explicit
manifest evaluator and compact report, so the public command only needs a small
policy path rule and CLI wrapper.

## Decision

Add `topaz check <entry.ts>` as a command-position subcommand beside `doctor`
and `explain`. The command resolves the entry like `doctor`, requires a `.ts`
entry, checks only `join(dirname(resolvedEntry), manifestPolicyFilename())`,
prints `formatManifestCheckReport`, and maps `result.ok` to process exit
status. Rejected alternatives: adding `--policy`, searching cwd, walking parent
directories, inferring package roots, reading package metadata, adding manifest
init/writes/prompts, making normal compile enforce manifests, changing
doctor/explain output, or touching runtime/prelude/header files.

## Implementation

- `src/cli.ts:17` imports the Phase 4.17 manifest check wrapper and report
  formatter, and `src/cli.ts:21` imports the canonical policy filename helper.
- `src/cli.ts:25` adds `topaz check <entry.ts>` to `--help`, with a short
  read-only check section at `src/cli.ts:40`.
- `src/cli.ts:151` parses the check command with the same compile-only flag
  rejection style as `doctor` and `explain`.
- `src/cli.ts:182` fixes the initial public policy path to entry-adjacent
  `strict-ts.json`, prints the existing report, and exits 1 only when the
  evaluator says the graph is not covered.
- `tests/smoke.sh:649` extends help assertions, and `tests/smoke.sh:721` adds
  public CLI smoke coverage for missing, full, partial, and invalid policies
  plus rejected arguments.
- `scripts/check-cli-selfhost.mjs:14` requires the generated native CLI help to
  mention the check command.

## Consequences

- **Accepted**: `topaz check pure.ts` with no adjacent policy prints a missing
  policy, `missing capabilities: none`, `status: ok`, and exits 0.
- **Accepted**: effectful graphs with missing or partial adjacent policy print
  the missing capability report and exit 1.
- **Accepted**: adjacent full policies exit 0, and invalid adjacent policies
  preserve parser/validator diagnostics while exiting 1.
- **Rejected**: `check` has no compile-only flags, no generic options, and only
  one positional entry; normal `topaz <entry.ts>` remains zero-config.
- **Regression**: build, manifest check/self-host gates, full CLI self-host,
  `src/cli.ts` C emission probe, and `pnpm test`.
