# 0305 - CLI unknown catch fallback diagnostic

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

After [0304](./0304-cli-generic-error-fallback-removal.md), the full graph
self-host probe advanced to `src/cli.ts:220:9`, where the CLI top-level catch
block rethrew the catch binding. In Topaz, throw values are limited to class
instances, and a catch binding is `unknown` until narrowed. The concrete
compiler diagnostic catches already handle `ParseError`, `LexError`,
`LoaderError`, and `CodegenError`, so only the unexpected fallback path was
outside the subset.

## Decision

Normalize unexpected top-level CLI exceptions to a deterministic internal
diagnostic with `die("internal error: unhandled exception")`. This preserves
the existing user-facing formatting for concrete compiler diagnostics while
avoiding `throw unknown`.

Rejected alternatives: allowing `throw unknown` was rejected because it would
loosen the throw-value rule and complicate runtime payload handling; adding or
emulating JavaScript `Error` was rejected as broader runtime and language work;
structural `err.message` access was rejected because it would require property
access on `unknown` without narrowing; keeping the rethrow was rejected because
it leaves `src/cli.ts` outside the current self-host subset.

## Implementation

- `src/cli.ts:216` through `src/cli.ts:219` keep the existing concrete compiler
  diagnostic branches unchanged.
- `src/cli.ts:220` now calls `die("internal error: unhandled exception")` for
  any caught value that is not one of the known compiler diagnostic classes.

## Consequences

- **Accepted**: parse, lex, loader, and codegen diagnostics remain formatted by
  their existing CLI branches.
- **Accepted**: unexpected caught values produce
  `topaz: internal error: unhandled exception` and exit through the same
  diagnostic helper as other CLI errors.
- **Rejected**: the compiler subset still does not add JavaScript `Error`,
  `throw unknown`, or structural `message` access on `unknown`.
- **Regression**: no examples were added because this is an unexpected-internal
  fallback path; the full graph self-host probe covers the source-subset fix.
- **Self-host**: the old `src/cli.ts:220:9` `unknown` rethrow blocker is
  removed. The next blocker should be recorded by the full graph probe.
