# 0330 - manifest doctor capability guidance design

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.2

## Context

Phase 3.0 defined effect atoms and capabilities as compile-time vocabulary in
[0328](./0328-capability-effect-tracking-design.md). Phase 3.1 then kept
`topaz <entry.ts>` as the zero-config entry experience and made manifest policy
optional in [0329](./0329-zero-config-package-resolution-design.md). The
missing product layer is guidance: users need Topaz to explain which source
locations require capabilities before they can author a useful policy file.
This phase records the UX and responsibility split only; it does not add CLI
commands, manifest parsing, stdlib metadata, effect inference, examples, smoke
cases, package lookup, or runtime enforcement.

## Decision

Topaz should infer capability requirements from the entry graph first, explain
them with source provenance, and treat manifests as optional policy rather than
the baseline requirement for compilation. A compatible graph may still compile
without a manifest, while Topaz can report inferred requirements. Once later
phases add manifest enforcement, the same inferred requirements can be checked
against allow/deny policy.

Future CLI surfaces split the guidance workflow by intent. `topaz doctor
<entry.ts>` is read-only diagnosis for inferred effects, capability needs,
unsupported imports, and manifest mismatches. `topaz manifest init <entry.ts>`
is write-capable generation that asks one permission decision at a time from
concrete provenance, such as whether a specific file and line may use
`fs.read`. `topaz check <entry.ts>` validates that an existing manifest is
understood by the current CLI and covers inferred requirements. `topaz explain
capability <name>` and `topaz explain std/<module>` provide embedded
documentation for capability names, their purpose, and the APIs that require
them.

Diagnostics should carry file, line, column where possible, the
import/API/call that introduced the effect, the capability atom, and whether
the source belongs to the entry package or to a dependency graph. Future
`node_modules` source lookup should participate in the same inference model
when Topaz compiles dependency source; dependency code is not trusted or opaque
merely because it came from a package boundary.

Rejected alternatives: requiring a manifest before any build was rejected
because it conflicts with the zero-config entry experience; hiding capability
inference until a config exists was rejected because the first manifest would
then require outside documentation; broad package-level prompts only were
rejected because they lose the concrete source explanation; treating
`node_modules` as trusted or opaque was rejected because compiled dependency
graphs still have effects; implementing schema or CLI commands now was
rejected because this phase only locks product behavior and follow-up
boundaries.

## Implementation

- `MEMO.md` records Phase 3.2 as complete and points the roadmap at this ADR.
- Future CLI work should keep `doctor`, `manifest init`, `check`, and `explain`
  separate so read-only diagnostics, write-capable generation, policy
  validation, and documentation do not blur together.
- No `src/`, `runtime/`, parser bridge, examples, smoke tests, package files,
  README, config files, manifest schema, or stdlib metadata is changed by this
  ADR.

## Consequences

- **Accepted**: capability vocabulary remains useful without a required
  manifest because it powers diagnostics, explanations, and guided policy
  authoring from real source locations.
- **Rejected**: no manifest-first build requirement, no config-hidden
  inference, no broad-only permission prompts, no trusted opaque dependency
  graphs, and no implementation of these CLI surfaces in this phase.
- **Regression**: no new examples or smoke entries; this phase is design-only
  and relies on the existing `pnpm run build` and `pnpm test` gates.
- **Scope out**: exact manifest filename and schema, prompt UI details,
  non-interactive flags, concrete stdlib metadata representation, effect
  inference, loader/package resolution, WASI or host-specific mapping, runtime
  sandboxing, and the current self-host probe blocker remain follow-up work.
