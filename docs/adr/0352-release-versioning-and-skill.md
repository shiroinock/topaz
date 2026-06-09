# 0352 - release versioning and release skill

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

[0351](./0351-github-actions-release-artifact.md) made `v*` tags the release
intent for GitHub Actions artifact builds, while ordinary `main` pushes do not
create GitHub Releases. The next missing piece is a stable version-numbering
policy and a repeatable release runbook so future release candidates do not
depend on remembered chat context.

Topaz is still before a stable language/package contract. The public promise is
currently the single-binary MVP, not a long-term compatibility guarantee for
all future Topaz source.

## Decision

Use `0.x.y` SemVer until the language, package, and capability contracts are
stable enough for `1.0.0`. Reserve `v0.1.0` for the single-binary MVP. Use
`v0.1.y` for MVP-preserving fixes, and bump minor versions when the accepted
language subset, runtime semantics, stdlib/package surface, artifact shape, or
release UX expands. Use `-rc.N` tags for release candidates and keep final
release publication manual.

Add `.agents/skills/topaz-release/SKILL.md` as the repo-local release runbook.
The skill records the version allocation, local preflight commands, RC/final tag
flow, draft Release verification, black-box validation handoff, and recovery
rules. A normal `main` push remains non-release activity.

Rejected alternatives: `1.0.0` was rejected as too strong before capability,
manifest, doctor, and broader package semantics settle; calendar versioning was
rejected because Topaz's release meaning is capability-based rather than
date-based; automatic non-draft publication was rejected until signing,
notarization, and release review policy exist.

## Implementation

- `MEMO.md:266-277`: adds Phase 3.12 and a release/version allocation section
  mapping `v0.1.0` through later `0.x` tracks to roadmap scope.
- `.agents/skills/topaz-release/SKILL.md:1-105`: adds the reusable release
  procedure for RCs, final releases, and recovery.

## Consequences

- **Accepted**: `v0.1.0` means the single-binary MVP.
- **Accepted**: patch releases preserve the existing MVP promise; minor
  releases may expand Topaz's accepted surface.
- **Accepted**: release candidates use `v0.x.y-rc.N` and create draft Releases.
- **Rejected**: `main` push, local artifact creation, or final publication are
  not enough to mean "released".
- **Future work**: update this allocation if signing/notarization, artifact
  attestations, or multi-platform release jobs change the release contract.
