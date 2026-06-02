# 0073. CLI JSON tooling cut (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0072](./0072-cli-input-local-narrowing.md) moved the full graph self-host
probe to `src/cli.ts:115`, where `--parse-only` used `JSON.stringify`. The
frozen self-hosting inventory already classifies `JSON.stringify` as tooling
scope outside the self-host path for now.

## Decision

Remove `JSON.stringify` from `src/cli.ts`: keep `--lex-only` useful by replacing
token string quoting with a local ASCII JSON-style `dumpQuote`, and make
`--parse-only` fail explicitly with `die(...)` until a real JSON/debug dump
facility is designed.

Rejected alternatives: adding `JSON.stringify` would be broad runtime/library
work; hand-writing a full AST JSON serializer in this prep step would be large
and orthogonal to the compiler self-host path.

## Implementation

- `src/cli.ts:114` changes `--parse-only` to a clear unsupported diagnostic.
- `src/cli.ts:151` replaces token `JSON.stringify` calls with `dumpQuote`.
- `src/cli.ts:169` adds local lower-hex helpers and `dumpQuote`.

## Consequences

- **Accepted**: normal compile, `--emit-c-only`, and `--lex-only` remain usable.
- **Temporary cut**: `--parse-only` no longer dumps AST JSON; restore this with
  a deliberate JSON/debug-dump design rather than implicit `JSON.stringify`.
- **Rejected**: no `JSON` global is added.
- **Regression**: no new example was added; existing CLI smoke cases cover the
  normal and emit-c-only paths, and the full graph self-host probe covers this
  compiler-source cleanup.
