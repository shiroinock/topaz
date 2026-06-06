import { mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
process.chdir(repoRoot);

const runs = parseRuns(process.env.TOPAZ_BENCH_RUNS ?? "3");

function parseRuns(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`TOPAZ_BENCH_RUNS must be a positive integer, got '${raw}'`);
  }
  return parsed;
}

function runCommand(label, cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with status ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function ensureOutput(label, actual, expected) {
  const trimmed = actual.trim();
  if (trimmed !== expected) {
    throw new Error(`${label} expected '${expected}', got '${trimmed}'`);
  }
}

function measure(label, fn) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const best = samples[0];
  const median = samples[Math.floor(samples.length / 2)];
  console.log(
    `BENCH ${label} best_ms=${best.toFixed(2)} median_ms=${median.toFixed(2)} runs=${runs}`,
  );
}

mkdirSync("build", { recursive: true });

runCommand("build", "pnpm", ["run", "build"]);

measure("compiler.emit.cli_c", () => {
  runCommand("compiler.emit.cli_c", "node", [
    "dist/cli.js",
    "src/cli.ts",
    "--emit-c-only",
    "-o",
    "build/bench_cli_emit",
  ]);
});

runCommand("prepare compiler C", "node", [
  "dist/cli.js",
  "src/cli.ts",
  "--emit-c-only",
  "-o",
  "build/bench_cli_emit",
]);

measure("cc.compile.cli_native", () => {
  runCommand("cc.compile.cli_native", "cc", [
    "-O2",
    "-Iruntime",
    "build/bench_cli_emit.c",
    "-o",
    "build/bench_cli_native",
  ]);
});

measure("topaz.build.fib", () => {
  runCommand("topaz.build.fib", "node", [
    "dist/cli.js",
    "examples/fib.ts",
    "-o",
    "build/bench_fib",
  ]);
});

runCommand("prepare fib", "node", [
  "dist/cli.js",
  "examples/fib.ts",
  "-o",
  "build/bench_fib",
]);

measure("native.run.fib", () => {
  const out = runCommand("native.run.fib", "./build/bench_fib", [], { capture: true });
  ensureOutput("native.run.fib", out.stdout, "5702887");
});

measure("topaz.build.runtime_hot_paths", () => {
  runCommand("topaz.build.runtime_hot_paths", "node", [
    "dist/cli.js",
    "benchmarks/runtime_hot_paths.ts",
    "-o",
    "build/bench_runtime_hot_paths",
  ]);
});

runCommand("prepare runtime hot paths", "node", [
  "dist/cli.js",
  "benchmarks/runtime_hot_paths.ts",
  "-o",
  "build/bench_runtime_hot_paths",
]);

measure("native.run.runtime_hot_paths", () => {
  const out = runCommand("native.run.runtime_hot_paths", "./build/bench_runtime_hot_paths", [], {
    capture: true,
  });
  ensureOutput("native.run.runtime_hot_paths", out.stdout, "210206697");
});
