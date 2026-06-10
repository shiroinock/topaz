# 0354 - release workflow stabilization

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: release prep

## Context

`v0.1.0-rc.2` and `v0.1.0` both produced valid draft GitHub Releases, and the
downloaded `topaz-darwin-arm64` assets passed checksum and black-box compiler
smoke checks. The remaining release friction was a GitHub Actions annotation:
`actions/checkout@v4`, `actions/setup-node@v4`, and
`actions/upload-artifact@v4` were running as JavaScript actions on Node.js 20,
which GitHub flagged as deprecated.

The same release runs also showed that the practical human checklist needs to
include the downloaded asset check, not just the local `pnpm run build:release`
gate.

## Decision

Treat `v0.1.1` as a patch-level release workflow stabilization. The workflow
opts JavaScript actions into Node.js 24 with
`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`, while README, MVP docs, and the
repo-local release skill explicitly require checksum verification and a
downloaded-binary black-box compiler smoke before publication.

Rejected alternatives: upgrading action major versions without a failing run was
rejected because the GitHub annotation already provides a narrower migration
switch; changing release artifact shape was rejected because `v0.1.1` should
preserve the `v0.1.0` single-binary MVP contract.

## Implementation

- `.github/workflows/release-artifact.yml`: workflow-level Node 24 opt-in for
  JavaScript actions.
- `README.md`: checksum verification is part of downloaded compiler usage.
- `docs/mvp.md`: black-box handoff checklist now includes checksum verification.
- `.agents/skills/topaz-release/SKILL.md`: RC and final release flows require
  downloaded asset verification and binary-only compiler smoke.
- `MEMO.md`: records `v0.1.1` as an MVP-preserving patch.

## Consequences

- **Accepted**: release workflow warnings from the Node.js 20 action runtime are
  handled without changing artifact shape.
- **Accepted**: release operators and black-box testers get the same downloaded
  asset verification steps.
- **Rejected**: this patch does not expand language syntax, runtime semantics,
  stdlib surface, package lookup, or release asset names.
- **Future work**: if GitHub changes the Node 24 migration path, revisit the
  action versions or environment switch before cutting the next patch release.
