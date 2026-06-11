# 0447 - v0.2 handoff checklist

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.28

## Context

ADR [0444](./0444-v0-2-guidance-docs.md) documented the current v0.2 guidance
surface, and ADRs [0445](./0445-release-guidance-fixture.md) /
[0446](./0446-release-artifact-guidance-fixture.md) fixed the release guidance
fixtures to match the current two-argument `std/fs.writeFileSync` API. The
release artifact smoke exercises the guidance commands, but `docs/mvp.md` still
left the binary-only handoff path too dependent on README context for an
external tester who only receives the compiler binary, checksum, docs, and a
temporary fixture.

## Decision

Add a self-contained v0.2 guidance smoke to the MVP handoff doc while preserving
the historical MVP boundary and the zero-config compile promise. The documented
fixture uses `readFileSync(path, "utf8")`, `writeFileSync(path, content)`, and
`writeStdout(text)` so the guidance loop requires `fs.read`, `fs.write`, and
`io.stdout`. Guard that handoff text with a static smoke contract. Rejected
alternatives: changing CLI behavior, requiring `strict-ts.json` for normal
compile, rewriting the original v0.1.0 MVP as if guidance was historical MVP
surface, adding prompt/force/policy discovery behavior, changing manifest
schema or permission enforcement, tagging, publishing, or touching runtime and
generated artifacts.

## Implementation

- `docs/mvp.md:52` keeps v0.2 guidance explicitly post-MVP while making it part
  of current release-candidate binary validation.
- `docs/mvp.md:57` adds the `guidance-smoke/effectful.ts` fixture using the
  current two-argument `writeFileSync` surface.
- `docs/mvp.md:72` lists the binary-only `--help`, `doctor`, manifest preview,
  manifest write, `check`, and `explain` commands.
- `docs/mvp.md:86` documents the preview/no-write, write-if-absent, and
  follow-up `missing capabilities: none` / `status: ok` expectations.
- `docs/mvp.md:265` mirrors the guidance loop in the black-box checklist.
- `tests/smoke.sh:446` adds `mvp_guidance_handoff_contract` and rejects the
  stale three-argument `writeFileSync(..., "utf8")` fixture if it returns.
- `MEMO.md:361` records Phase 4.28 as a docs/test checkpoint.

## Consequences

- **Accepted**: external testers can validate the current v0.2 guidance loop
  with only the native compiler artifact, checksum, docs, and a temporary
  fixture.
- **Accepted**: the handoff doc distinguishes original MVP scope from current
  post-MVP guidance commands.
- **Accepted**: normal `pnpm test` fails if the handoff checklist drops the
  guidance commands, strict-ts write/check expectations, required capability
  atoms, or current `writeFileSync(path, content)` arity.
- **Rejected**: CLI behavior, manifest schema, compile-time permission
  enforcement, runtime sandboxing, package lookup, runtime/prelude/header,
  release tag policy, GitHub workflow behavior, and generated artifacts remain
  unchanged.
- **Regression**: `pnpm run build` and `pnpm test`.
