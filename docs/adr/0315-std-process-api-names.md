# 0315 - std/process API names

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.2c

## Context

[0313](./0313-stdlib-surface-design.md) fixed the public stdlib direction as
`std/fs`, `std/path`, and `std/process`, while keeping existing `node:*`
shortcuts for compiler/self-host compatibility. [0314](./0314-std-path-alias.md)
then landed `std/path` as the first public alias because its API was already a
named-import shape.

Process and stderr support is different: [0026](./0026-process-console-builtins.md)
introduced synthetic globals for `process.argv`, `process.exit`,
`process.stdout.write`, `process.stderr.write`, and `console.error` to unblock
self-hosting. The public `std/process` names need to be fixed before loader or
codegen support can expose them as imports.

## Decision

Expose `std/process` as flat named imports:
`argv`, `exit`, `writeStdout`, `writeStderr`, and `writeError`.
`argv: string[]` keeps the current Topaz-native argv shape,
`[executablePath, ...args]`, not Node's `[node, script, ...args]`.
`exit(code?: number): never` maps to the existing synthetic `process.exit`.
`writeStdout(s: string): void` and `writeStderr(s: string): void` map to the
existing stream writes, and `writeError(s: string): void` is the public
line-oriented stderr helper for the existing `console.error` capability.

Keep the synthetic globals as compiler compatibility shortcuts for now.
Implementation of `std/process` imports is deferred to a later phase.

Rejected alternatives: exporting a `process` object or namespace/default import
shape was rejected because the subset already rejects namespace/default stdlib
imports and a value object would require broader object/function value
semantics. Importing nested Node-shaped names such as `stdout.write` was
rejected because public stdlib imports should stay flat. A separate
`std/console` module was rejected for this first process/stdio surface because
`writeError` can expose the existing stderr helper without splitting modules.
Environment variables, stdin, signals, pid, cwd, spawn, URL, and child process
APIs remain out of scope.

## Implementation

- `MEMO.md:236` marks `2.2c process stdlib design` complete and records the
  accepted import names.
- No loader allowlist, runtime, codegen, examples, or smoke-test behavior
  changes are made in this phase.

## Consequences

- **Accepted**: public Topaz code can eventually import process/stdio helpers
  from `std/process` without requiring a first-class `process` object.
- **Accepted**: existing `process.*` and `console.error` synthetic globals
  continue to serve self-host/compiler compatibility unchanged.
- **Divergence**: `argv` preserves the Topaz-native `[executablePath, ...args]`
  shape documented in [0026](./0026-process-console-builtins.md).
- **Regression**: `pnpm run build` and `pnpm test` cover unchanged behavior.
- **Scope out**: actual `std/process` loader/codegen support, compiler-source
  import rewrites, `std/console`, environment variables, stdin, signals, cwd,
  spawn, URL, and child process APIs remain future work.
