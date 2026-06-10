# 0417 - RC draft release prerelease flag

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.90

## Context

The `v0.1.3-rc.1` tag-driven artifact run produced the expected draft GitHub
Release and assets, but `gh release view` reported `isPrerelease:false`. RC
tags are black-box validation candidates and should be distinguishable from
final tags in the GitHub UI and API, while final release tags should remain
draft-only until manual publication.

## Decision

Treat tags containing `-rc.` as GitHub prereleases in addition to drafts when
the tag-triggered release workflow creates a draft Release. Final tags such as
`v0.1.3` continue to create draft, non-prerelease Releases. Rejected
alternatives: editing the already-created `v0.1.3-rc.1` draft Release was
rejected because the workflow is the source of truth for future RCs; marking
every draft Release as prerelease was rejected because final tags need a
draft-only publication staging point; a networked `gh release` smoke was
rejected because the local gate must stay offline and credential-free.

## Implementation

- `.github/workflows/release-artifact.yml:59` computes
  `release_flags=(--draft)` and appends `--prerelease` only when the tag
  contains `-rc.` before calling `gh release create`.
- `tests/smoke.sh:11` adds `release_workflow_prerelease`, an offline static
  smoke that checks the workflow keeps the draft baseline, RC branch,
  prerelease flag, and computed flag expansion wired together.
- `.agents/skills/topaz-release/SKILL.md:130` updates the RC checklist to
  expect `isDraft:true` and `isPrerelease:true`, and
  `.agents/skills/topaz-release/SKILL.md:167` updates the final release
  checklist to confirm final drafts are not prerelease.
- `MEMO.md:331` records Phase 3.90 as a release workflow/documentation fix.

## Consequences

- **Accepted**: future `*-rc.*` tag-driven draft Releases are also GitHub
  prereleases.
- **Accepted**: final tags remain draft-only and non-prerelease until manual
  publication.
- **Rejected**: this phase does not push tags, edit GitHub Releases, retag,
  publish non-draft releases, change asset names, or change compiler/runtime
  behavior.
- **Regression**: `pnpm test` includes the offline
  `release_workflow_prerelease` static smoke; `pnpm run build` remains the
  build gate.
- **Scope外**: existing already-created draft Releases, release notes, asset
  contents, language/codegen/runtime behavior, package lookup, manifest,
  doctor, check, and explain remain unchanged.
