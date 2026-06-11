# 0440 - public manifest init CLI

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.21

## Context

ADR [0439](./0439-strict-ts-manifest-suggestion-renderer.md) added a
self-hostable pure renderer for normalized `strict-ts.json` suggestions but left
the public `topaz manifest init` command out. The v0.2 guidance surface now has
read-only `doctor`, `check`, and `explain` commands, so generation intent can be
exposed as a deterministic preview without yet choosing file write or prompt
semantics.

## Decision

Add `topaz manifest init <entry.ts>` as a command-position subcommand family
beside `doctor`, `check`, and `explain`. The command resolves the entry like the
other guidance commands, requires a `.ts` file, collects manifest requirements
from the loaded source graph, and writes the Phase 4.20 normalized policy text
to stdout. Rejected alternatives: writing `strict-ts.json`, prompting,
discovering parent/package policies, adding `--policy`/`--write`/`--yes` or
dry-run flags, folding generation intent into `doctor` or `check`, changing the
schema, adding permission enforcement, or adding runtime sandboxing.

## Implementation

- `src/cli.ts:21` imports the normalized manifest renderer, and
  `src/cli.ts:23` imports the requirement collector.
- `src/cli.ts:30` adds `topaz manifest init <entry.ts>` to help, with the short
  help section at `src/cli.ts:46`.
- `src/cli.ts:196` implements `runManifestCommand(...)`, including the missing
  subcommand diagnostic, compile-only flag rejection, single entry positional
  check, `.ts` extension check, requirement collection, and direct stdout write.
- `src/cli.ts:286` dispatches command-position `manifest` before normal compile
  option parsing.
- `scripts/check-cli-selfhost.mjs:15` requires the generated native CLI help to
  include the new command.
- `tests/smoke.sh:697` extends public help smoke coverage, and
  `tests/smoke.sh:884` adds effectful, pure, missing-subcommand, and compile-flag
  public CLI regressions.
- `MEMO.md:354` records the Phase 4.21 checkpoint.

## Consequences

- **Accepted**: effectful entry graphs print a single normalized capability list
  in existing requirement order, including `fs.read`, `fs.write`, and
  `io.stdout` for the smoke fixture.
- **Accepted**: pure graphs print an empty capability array and do not require an
  existing `strict-ts.json`.
- **Rejected**: `topaz manifest`, missing entries, extra positional arguments,
  compile-only flags, generic manifest options, and non-`.ts` entries fail with
  deterministic `topaz:` diagnostics.
- **Rejected**: file writes, prompts, policy discovery, overwrite handling,
  permission enforcement, runtime sandboxing, and schema expansion remain outside
  this phase.
- **Regression**: `pnpm run build`, `pnpm run check:manifest-generate`, `pnpm
  run check:manifest-selfhost`, `pnpm run check:cli-selfhost`, `node
  dist/cli.js src/cli.ts --emit-c-only -o build/orch_selfhost_probe`, and `pnpm
  test`.
