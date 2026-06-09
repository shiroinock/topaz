# 0337 - single-binary MVP UX gate

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.9

## Context

[0333](./0333-single-binary-mvp-roadmap.md) redrew Phase 3 around the
single-binary MVP, and [0334](./0334-public-std-fs.md),
[0335](./0335-public-std-process.md), and
[0336](./0336-minimal-bare-package-lookup.md) added the public stdlib and
minimal package lookup pieces. The remaining gate is user-facing: the README and
CLI help should accurately describe the zero-config entry path and boundaries
without promising post-MVP behavior.

## Decision

Declare the MVP usable when `topaz <entry.ts>` compiles a Topaz-subset source
graph to one native binary with no required config, public `std/fs`,
`std/path`, and `std/process` are documented, minimal package-root lookup is
documented, unsupported package shapes are described as rejected, and CLI help
is smoke-tested. Correct the `--parse-only` help text so it is
unsupported/reserved in the self-host subset instead of promising a JSON AST
dump. Rejected alternatives: adding manifest, doctor, check, explain,
capability enforcement, runtime sandboxing, async, regexp, richer package
entries, package subpaths, npm install, CommonJS, Node emulation, or functional
parse-only JSON output was rejected because those are post-MVP work.

## Implementation

- `README.md:1` now describes Topaz as a TypeScript-syntax AOT native compiler
  with intentionally reduced JavaScript semantics.
- `README.md:16` documents the zero-config compile/run flow using
  `pnpm run topaz examples/fib.ts -o build/fib` and `./build/fib`.
- `README.md:33` documents public `std/fs`, `std/path`, and `std/process`.
- `README.md:44` documents minimal package-root lookup and the unsupported npm
  compatibility shapes that fail at the package boundary.
- `src/cli.ts:13` changes `--parse-only` help from a JSON AST promise to an
  unsupported/reserved self-host subset option.
- `tests/smoke.sh:147` adds CLI help assertions for successful `--help`, the
  usage line, `--emit-c-only`, and the unsupported/reserved `--parse-only`
  wording.
- `MEMO.md:263` marks Phase 3.9 complete.

## Consequences

- **Accepted**: users get an accurate zero-config single-binary entry path and
  public MVP boundary.
- **Accepted**: CLI help output is now part of the daily smoke gate.
- **Rejected**: no compiler semantics, runtime behavior, package lookup rules,
  manifest/capability tooling, async, regexp, or Node compatibility behavior
  changes land in this phase.
- **Regression**: `cli_help` is added inside `run_cli_smoke`; existing positive
  and fail examples continue to cover stdlib, package lookup, and diagnostics.
