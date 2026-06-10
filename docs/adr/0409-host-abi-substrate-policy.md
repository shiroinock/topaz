# 0409 - host ABI substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.82

## Context

Runtime TS migration has exhausted ordinary pure helper moves for strings and
BigInt, closed their legacy migration lanes in ADR
[0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), and pinned the three
`libc-libm-boundary` number helpers in ADR
[0408](./0408-libc-libm-number-substrate-policy.md). The remaining host
wrappers are different from pure Topaz-subset algorithms: they cross
filesystem, process, stdio, module URL, cwd, exit, argv, and child process ABI
surfaces. ADR [0331](./0331-stdlib-capability-metadata-design.md) fixed future
stdlib capability metadata, and ADR
[0332](./0332-builtin-descriptor-metadata-skeleton.md) added the descriptor
metadata skeleton without enforcing capabilities yet.

## Decision

Keep the twelve host ABI symbols in `host-abi-boundary` before v0.2.0:
`topaz_stdout_write(...)`, `topaz_stderr_write(...)`,
`topaz_fs_read_text_file(...)`, `topaz_fs_exists(...)`,
`topaz_fs_write_text_file(...)`, `topaz_fs_mkdir_p(...)`,
`topaz_process_cwd(...)`, `topaz_runtime_init_argv(...)`,
`topaz_process_argv(...)`, `topaz_process_exit(...)`,
`topaz_runtime_module_url(...)`, and `topaz_child_exec_inherit(...)`. Treat
future movement as an explicit capability-aware host syscall or intrinsic
replacement ADR that accounts for manifest, doctor, check, and explain UX.
Rejected alternatives: migrating filesystem/process/child process wrappers now
was rejected because their core behavior is host ABI calls; adding
manifest/capability enforcement here was rejected because v0.2 owns that track;
closing `host-abi-boundary` was rejected because twelve active symbols remain;
reclassifying raw stdio writes was rejected because they are user-visible host
effects.

## Implementation

- `scripts/check-runtime-substrate.mjs:33` updates `NEXT.HOST_ABI` to name the
  pinned pre-v0.2 capability-aware host ABI substrate boundary and its helper
  families.
- `tests/smoke.sh:37` asserts that the normal substrate summary still includes
  `host-abi-boundary: 12`.
- `docs/runtime-ts-migration.md:86` documents the Phase 3.82 host ABI substrate
  policy and relates it to the v0.2 manifest/capability/doctor track.
- `MEMO.md:323` records Phase 3.82 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: raw stdio, filesystem, process argv/cwd/exit, module URL, and
  child process spawn wrappers remain visible as the twelve-symbol
  `host-abi-boundary` lane.
- **Accepted**: v0.2 can build capability inference and manifest guidance
  against an explicitly documented host boundary.
- **Rejected**: helper-by-helper runtime prelude migration no longer applies to
  these host ABI wrappers.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `host-abi-boundary: 12`, and `pnpm test` now asserts that lane count in the
  main smoke gate.
- **Scope外**: runtime behavior, generated C lowering, public APIs,
  `runtime/runtime.h`, `runtime/prelude.ts`, generated runtime files,
  manifest/capability enforcement, doctor/check/explain commands, and
  `src/codegen.ts` are unchanged.
