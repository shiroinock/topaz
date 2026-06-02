# 0074. CLI output local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0073](./0073-cli-json-tooling-cut.md) moved the full graph self-host probe to
`src/cli.ts:119`, where `resolve(parsed.output)` saw `parsed.output` as
`string | undefined` inside a ternary branch. The current subset requires a
plain string at the `resolve` call site.

## Decision

Copy `parsed.output ?? ""` to `outputArg`, initialize `output` to the default
input-derived path, and overwrite it with `resolve(outputArg)` only when
`parsed.output !== undefined`.

Rejected alternatives: teaching property-read narrowing through ternary
branches is a compiler feature decision; carrying a non-null assertion would be
less explicit and outside the current self-host cleanup pattern.

## Implementation

- `src/cli.ts:118` initializes `output` to the input-derived default.
- `src/cli.ts:119` stores `parsed.output ?? ""` in `outputArg`.
- `src/cli.ts:120` assigns `resolve(outputArg)` inside the explicit branch.

## Consequences

- **Accepted**: default and `-o` output behavior is unchanged.
- **Rejected**: no new optional property narrowing behavior is added.
- **Regression**: no new example was added because existing CLI smoke cases
  cover default and explicit output paths, and the full graph self-host probe
  covers this compiler-source cleanup.
