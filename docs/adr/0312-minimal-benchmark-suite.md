# 0312 - minimal benchmark suite

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.1

## Context

[0311](./0311-phase2-baseline-hygiene.md) established a passing Phase 2
baseline and recorded the generated full-compiler C warning inventory. The next
Phase 2 task is to make performance changes measurable before runtime or
number-formatting work starts.

## Decision

Add an opt-in `pnpm bench` development harness that measures wall-clock time
for compiler C emission, generated compiler C compilation, `examples/fib.ts`
build/run, and a small native runtime hot-path program. The harness reports the
best and median times across `TOPAZ_BENCH_RUNS` runs, defaulting to 3.

Rejected alternatives: putting benchmarks under `pnpm test` was rejected
because compile-heavy timing would slow the smoke suite; depending on an
external benchmark package was rejected because Node's `performance.now()` and
`spawnSync` are enough for the initial harness; putting benchmark programs in
`examples/` was rejected because they are workload fixtures, not user-facing
language samples.

## Implementation

- `package.json:17` exposes the benchmark harness as `pnpm bench`.
- `scripts/bench.mjs:8` reads `TOPAZ_BENCH_RUNS`, `scripts/bench.mjs:42`
  reports best/median samples, and `scripts/bench.mjs:61` starts the measured
  compiler/runtime commands.
- `benchmarks/runtime_hot_paths.ts:1` exercises number loops,
  `benchmarks/runtime_hot_paths.ts:11` exercises string slicing / `charCodeAt`
  / `String.fromCharCode`, and `benchmarks/runtime_hot_paths.ts:27` exercises
  `Map` / `Set` operations while printing a fixed checksum.
- `MEMO.md:233` marks `2.1 benchmark suite` complete and leaves stdlib,
  generic, and try/finally work as the next open Phase 2 actions.

Initial `pnpm bench` snapshot on this checkout:

| Benchmark | best ms | median ms | runs |
|---|---:|---:|---:|
| compiler.emit.cli_c | 148.34 | 153.99 | 3 |
| cc.compile.cli_native | 6902.07 | 7061.91 | 3 |
| topaz.build.fib | 108.78 | 108.98 | 3 |
| native.run.fib | 18.21 | 19.26 | 3 |
| topaz.build.runtime_hot_paths | 159.61 | 160.56 | 3 |
| native.run.runtime_hot_paths | 4.27 | 4.70 | 3 |

## Consequences

- **Accepted**: Phase 2 performance work now has a repo-local command and a
  stable runtime workload checksum.
- **Accepted**: benchmark timings remain opt-in and are not pass/fail
  thresholds.
- **Rejected**: no new language behavior or smoke sample is added.
- **Regression**: `pnpm bench` and `pnpm test` pass.
- **Scope out**: statistical benchmarking, CI perf tracking, Ryu replacement,
  warning cleanup, and stdlib redesign remain follow-up work.
