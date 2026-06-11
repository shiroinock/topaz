# 0456 - v0.2.0 release notes draft

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.37

## Context

Phase 4.36 / ADR [0455](./0455-v0-2-0-rc-readiness.md) added non-mutating
`v0.2.0` RC readiness for the current capability / manifest guidance surface.
Release operators still need checked-in structured notes for final publish
review so the still-draft final Release can be updated without deriving the
release story from phase commits or the workflow placeholder body.

## Decision

Add a final `v0.2.0` release notes draft at `docs/releases/v0.2.0.md`, point
the release skill at the notes-file command, and guard the document with a
normal smoke static contract. Rejected alternatives: editing the GitHub Release
now would mutate external release state; creating, deleting, moving, or pushing
tags would cross the release-operation boundary; reusing the RC readiness
checklist as final notes would omit user-facing release framing; changing CLI,
manifest, compile-time policy, runtime sandboxing, schema, policy discovery,
runtime/prelude/header, artifact, checksum, package version, or release
workflow behavior is outside this documentation/static-contract phase.

## Implementation

- `docs/releases/v0.2.0.md:1` adds structured final notes with `## Changes`,
  `## Assets`, `## Verification`, and `## Notes`.
- `.agents/skills/topaz-release/SKILL.md:112` records that `v0.2.0` notes are
  prepared at `docs/releases/v0.2.0.md` after the non-mutating RC readiness
  evidence passes, and can be applied with
  `gh release edit v0.2.0 --notes-file docs/releases/v0.2.0.md`.
- `tests/smoke.sh:723` adds `release_v0_2_0_notes_contract`, which checks the
  notes file, required sections, checksum and guidance artifact smoke commands,
  expected capability observations, unchanged zero-config/future-work
  boundaries, absence of the workflow placeholder, and release skill linkage.
- `MEMO.md:370` records Phase 4.37 as release-notes/static-contract work.

## Consequences

- **Accepted**: release operators get prepared final `v0.2.0` notes for review
  and later application to a still-draft Release.
- **Accepted**: normal `pnpm test` protects the notes and release-skill command
  without network access, GitHub auth, tag mutation, GitHub Release mutation,
  or `pnpm run build:release`.
- **Rejected**: this phase does not create, delete, move, push, or trust tags;
  edit, trust, reuse, or publish GitHub Releases; change package version; or
  change CLI, manifest schema, compile-time policy enforcement, runtime
  sandboxing, schema expansion, richer policy discovery, runtime/prelude/header,
  artifact, checksum, or release workflow behavior.
- **Regression**: `pnpm run build` and `pnpm test`.
