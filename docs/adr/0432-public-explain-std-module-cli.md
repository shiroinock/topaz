# 0432 - public explain std module CLI

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.13

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) reserved
`topaz explain std/<module>` as read-only embedded documentation for builtin
module surfaces. ADR [0331](./0331-stdlib-capability-metadata-design.md) and
ADR [0332](./0332-builtin-descriptor-metadata-skeleton.md) made builtin
descriptor metadata the shared owner of specifier/import names, semantic names,
status, effects, and explanations. ADR [0427](./0427-public-explain-capability-cli.md)
then exposed capability-atom explanations from the same metadata. The next
small public guidance surface is explaining one builtin module without loading
a source graph or introducing manifest policy.

## Decision

Add `topaz explain std/<module>` as a command-position subcommand beside
`explain capability <name>`. It renders only existing import descriptor
metadata: a stable module heading, one `apis:` section, and one row per import
with source import name, semantic name, status, effects, and descriptor
explanation. Unknown module specifiers fail with a `topaz:` diagnostic and
known module specifiers in descriptor order. Rejected alternatives:
`topaz check <entry.ts>`, `manifest init`, manifest schema/parsing/writing,
compile-time permission rejection, runtime sandboxing, new effect atoms,
package lookup changes, and runtime prelude/header changes remain out of scope
because this phase only exposes read-only builtin module docs.

## Implementation

- `src/capability_explain.ts:18` collects known import module specifiers from
  builtin descriptors without synthetic globals.
- `src/capability_explain.ts:47` formats `topaz builtin module: <specifier>`
  with deterministic API rows, status labels, and `effects: none` for pure
  helpers such as `std/path`.
- `src/cli.ts:7` imports the module formatter and known-specifier helper, and
  `src/cli.ts:23` updates help with `topaz explain std/<module>`.
- `src/cli.ts:142` keeps compile-only flag rejection shared across explain
  modes, preserves `explain capability <name>` behavior, and dispatches other
  single positional explain arguments as builtin module specifiers.
- `scripts/check-cli-selfhost.mjs:15` requires the generated CLI help to show
  the std module explain line.
- `tests/smoke.sh:578` covers help, `std/fs`, `std/path`, unknown module
  failure, and compile-only flag rejection for module explain.
- `MEMO.md:346` records the Phase 4.13 public std module explain checkpoint.

## Consequences

- **Accepted**: users and sub agents can discover public `std/fs` and
  `std/path` builtin API surfaces, capability effects, and pure helpers from
  the compiler binary itself.
- **Accepted**: compatibility specifiers such as `node:fs`, `node:path`,
  `node:url`, and `node:child_process` are explained by the same descriptor
  filter if requested.
- **Accepted**: `std/path` helpers render `effects: none`, matching their pure
  descriptor metadata.
- **Rejected**: manifest UX, policy checks, runtime sandboxing, package lookup
  changes, runtime/prelude/header changes, and effect vocabulary expansion
  remain future v0.2 work.
- **Regression**: `pnpm run build`, `pnpm run check:cli-selfhost`,
  `pnpm test`, and `node dist/cli.js src/cli.ts --emit-c-only -o
  build/orch_selfhost_probe`.
