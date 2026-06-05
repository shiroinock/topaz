# 0304 - CLI generic Error fallback removal

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

After [0303](./0303-contextual-iife-return-annotation-undefined-check.md), the
full graph self-host probe advanced to `src/cli.ts:220:22`, where the CLI catch
block used `err instanceof Error` as a final JavaScript fallback. Topaz does
not provide a builtin `Error` class; throw values in the supported subset are
source-defined class instances. Earlier decisions such as
[0055](./0055-internal-codegen-error-helper.md) and
[0180](./0180-remaining-internal-new-error-cleanup.md) keep JavaScript `Error`
out of the source language and route compiler diagnostics through concrete
project classes instead.

## Decision

Remove the generic `Error` fallback from the CLI catch block while preserving
the existing concrete diagnostic catches for `ParseError`, `LexError`,
`LoaderError`, and `CodegenError`. Unknown caught values still fall through to
`throw err`.

Rejected alternatives: adding a builtin `Error` class was rejected as broader
runtime and language work; structural `message` access on `unknown` was
rejected because it would weaken catch narrowing and introduce property access
semantics outside this cleanup; replacing the fallback with
`die("unknown error")` was rejected because it would swallow unexpected stage1
failures.

## Implementation

- `src/cli.ts:216` through `src/cli.ts:220` keep the concrete compiler
  diagnostic catches and remove the generic JavaScript `Error` branch.
- `src/cli.ts:220` still rethrows any unexpected caught value.

## Consequences

- **Accepted**: parse, lex, loader, and codegen diagnostics remain formatted by
  the CLI.
- **Accepted**: unexpected caught values are still rethrown instead of being
  normalized.
- **Rejected**: the compiler subset still does not add JavaScript `Error`
  support or structural `message` access on `unknown`.
- **Regression**: no examples were added because existing CLI failure coverage
  exercises the concrete diagnostic catches indirectly, and the full graph
  self-host probe covers removal of the unsupported builtin reference.
- **Self-host**: the old `src/cli.ts:220:22` builtin `Error` blocker is
  removed. The next blocker is `src/cli.ts:220:9`, where rethrowing the
  `unknown` catch value requires either explicit narrowing or a dedicated
  compiler-source cleanup.
