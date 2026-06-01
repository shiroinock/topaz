# 0035. CLI subset argv parser (6h)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6h

## Context

[0034](./0034-loader-subset-rewrite.md) left `src/loader.ts` in the Topaz
subset and the next production self-host probe stopped in `src/cli.ts` at the
planned `node:util.parseArgs` import. [0026](./0026-process-console-builtins.md)
had already rejected a `parseArgs` builtin as too much machinery for one CLI
call site, so 6h rewrites the CLI option parsing source instead of expanding
the runtime or loader.

## Decision

Replace `parseArgs` with a small `CliOptions` class and a hand-written parser
over `process.argv`. The parser handles the existing CLI surface only:
`-o`/`--output`, `--emit-c-only`, `--lex-only`, `--parse-only`, `-h`/`--help`,
and one positional input. It works under both stage1 Node argv
(`[node, script, ...args]`) and future native Topaz argv (`[exe, ...args]`) by
starting at index 2 when `argv[1]` ends in `.js`, otherwise index 1.

Rejected alternatives: adding `node:util.parseArgs` remains rejected by
[0026](./0026-process-console-builtins.md); special-casing `node:util` in the
loader would leave `cli.ts` outside the subset; general npm-style parsing such
as `--output=value` is outside this phase.

## Implementation

- `src/cli.ts`: removed the `node:util` import, added `CliOptions`,
  `argvStartIndex`, and `parseCliOptions`, and routed existing main flow through
  explicit fields (`emitCOnly`, `lexOnly`, `parseOnly`, `output`, `input`).
- `src/codegen.ts`: rewrote the lone regex literal in `isAnonClassName` to
  `startsWith` + ASCII digit checks, and replaced non-ASCII dashes in emitted
  diagnostic strings with ASCII hyphens so the source keeps moving through the
  Topaz parser.
- `tests/smoke.sh`: added CLI smoke coverage for `--emit-c-only`, `--output`,
  unknown option rejection, and missing output value rejection.

## Consequences

- **Accepted**: minimal CLI flags in any order around the single positional
  input; stage1 and stage2 argv shapes.
- **Rejected**: unknown options, missing `-o`/`--output` value, extra positional
  input, and generic `parseArgs` emulation.
- **Regression**: `cli_emit_c_only`, `cli_output_long_flag`,
  `cli_unknown_option`, and `cli_missing_output_value`; full `pnpm test` passes.
- **Next blocker**: the old `node:util` blocker is gone. The full graph probe
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  now advances into `src/codegen.ts` and stops at `readonly` in a type alias
  (`src/codegen.ts:82:33: expected type`), which belongs to the following
  source-subset cleanup / bootstrap work rather than CLI argv parsing.
