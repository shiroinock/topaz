# 0331 - stdlib capability metadata design

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.3

## Context

[0313](./0313-stdlib-surface-design.md) fixed the public stdlib direction as
`std/fs`, `std/path`, and `std/process`. [0314](./0314-std-path-alias.md)
then landed `std/path` as a pure public alias, and
[0315](./0315-std-process-api-names.md) fixed the public `std/process` names
without implementing them. [0328](./0328-capability-effect-tracking-design.md)
introduced effect atoms and said stdlib declarations should attach effect
metadata. [0330](./0330-manifest-doctor-capability-guidance-design.md) made
source-provenance diagnostics plus guided manifest generation a product
requirement.

Those future surfaces need one source of truth for which API introduces an
effect, which public or compatibility aliases share behavior, which APIs are
pure, and which compatibility-only APIs remain outside the public stdlib while
still producing honest diagnostics.

## Decision

Future effect inference should read capability metadata from semantic builtin
descriptors, not from ad hoc import-specifier branches. A descriptor contains
the accepted import or global shape, exported or called member, signature,
effect atoms, public-vs-compat status, and short explanation text suitable for
future `topaz explain`. Public `std/*` imports and compatibility `node:*` or
synthetic globals may point at the same descriptor when they have the same
behavior, while diagnostics preserve the source provenance that reached it.

Initial metadata mapping:

- `std/path` and `node:path` helpers `dirname`, `resolve`, `basename`,
  `extname`, and `join` are pure and require no capability.
- Future `std/fs` and existing compatibility `node:fs` map
  `readFileSync` to `fs.read`, `existsSync` to `fs.metadata`,
  `writeFileSync` to `fs.write`, and `mkdirSync` to `fs.write`.
- Future `std/process` maps `argv` to `process.argv`, `exit` to
  `process.exit`, `writeStdout` to `io.stdout`, `writeStderr` to `io.stderr`,
  and `writeError` to `io.stderr`.
- Existing synthetic compatibility globals map `process.argv` to
  `process.argv`, `process.exit` to `process.exit`,
  `process.stdout.write` to `io.stdout`, `process.stderr.write` to
  `io.stderr`, `console.log` to `io.stdout`, and `console.error` to
  `io.stderr`.
- Existing compatibility-only `node:url.fileURLToPath` and `import.meta.url`
  are pure for capability purposes.
- Existing compatibility-only `node:child_process.execFileSync` requires
  `process.spawn`. This adds `process.spawn` as a compatibility-only effect
  atom for honest diagnostics without adding a public `std/process` spawn API
  in this phase.

Initial manifest grant names should match effect atom names. Grouping can be
future UI sugar rather than a separate metadata layer.

Rejected alternatives: inferring effects from import specifier strings alone
was rejected because it would duplicate logic across loader, codegen, doctor,
manifest generation, and docs; treating compatibility `node:*` shortcuts as
invisible was rejected because compiler source and dependency graphs can use
them; collapsing stdlib calls into one opaque `impure` effect was rejected
because filesystem read/write/metadata, stdio, process exit, and spawn have
different policy meanings; adding public spawn, URL, import-meta, or filesystem
API surface now was rejected because this phase records metadata policy only;
implementing descriptor tables now was rejected so the next phase can choose
concrete code ownership after the product shape is fixed.

## Implementation

- `MEMO.md` records Phase 3.3 as complete and points the roadmap at this ADR.
- Future `doctor`, `manifest init`, `check`, and `explain` should read from the
  same descriptor metadata as effect inference, while presenting the original
  specifier or global shape that introduced each effect.
- No `src/`, `runtime/`, examples, smoke tests, README, package metadata,
  config files, manifest schema, loader behavior, codegen behavior, or runtime
  enforcement changes are made by this ADR.

## Consequences

- **Accepted**: capability inference, diagnostics, manifest guidance, and
  explanation text have a shared semantic source of truth.
- **Accepted**: public stdlib aliases and compatibility shortcuts can share a
  descriptor without losing provenance in user-facing diagnostics.
- **Accepted**: `process.spawn` exists only as a compatibility-only effect atom
  for `node:child_process.execFileSync` until a later phase deliberately adds a
  public process-spawn surface.
- **Rejected**: no descriptor table, loader/codegen refactor, `std/fs`,
  `std/process`, manifest enforcement, dependency graph/package resolution,
  runtime sandboxing, or public spawn API is implemented here.
- **Regression**: no new examples or smoke entries; this phase is design-only
  and relies on the existing `pnpm run build` and `pnpm test` gates.
- **Scope out**: concrete metadata data structures, ownership boundaries,
  future grouping UI, and the current self-host probe blocker remain follow-up
  work.
