# 0072. CLI input local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0071](./0071-cli-usage-function.md) moved the full graph self-host probe to
`src/cli.ts:98`, where `resolve(parsed.input)` saw `parsed.input` as
`string | undefined` even after an earlier property check. The current subset
needs a string-typed value at the `resolve` call site.

## Decision

Copy `parsed.input ?? ""` to `inputArg`, keep the missing-input check against
`parsed.input`, and pass the string local to `resolve`. The fallback empty
string is unreachable in normal execution because the missing-input branch
exits before `resolve`.

Rejected alternatives: broadening property-read narrowing is a language feature
decision; using a non-null assertion would fight the subset rule that rejects
redundant or incorrectly shaped assertions.

## Implementation

- `src/cli.ts:93` stores `parsed.input ?? ""` in `inputArg`.
- `src/cli.ts:94` keeps the missing-input check on `parsed.input`.
- `src/cli.ts:99` passes `inputArg` to `resolve`.

## Consequences

- **Accepted**: CLI missing-input behavior is unchanged.
- **Rejected**: no new property narrowing behavior is added.
- **Regression**: no new example was added because existing CLI smoke cases
  cover missing input and normal input, and the full graph self-host probe
  covers this compiler-source cleanup.
