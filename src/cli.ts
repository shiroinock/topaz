#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { codegen } from "./codegen.js";
import { loadModuleGraph } from "./loader.js";

const USAGE = `usage: topaz <input.ts> [-o <output>] [--emit-c-only]

options:
  -o, --output <path>   output binary path (default: <input> with .ts stripped)
  --emit-c-only         emit the generated .c next to output and exit (skip cc)
  -h, --help            show this help`;

function die(msg: string): never {
  console.error(`topaz: ${msg}`);
  process.exit(1);
}

function main(): void {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      output: { type: "string", short: "o" },
      "emit-c-only": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (parsed.values.help) {
    console.log(USAGE);
    return;
  }
  if (parsed.positionals.length !== 1) {
    console.error(USAGE);
    process.exit(2);
  }

  const input = resolve(parsed.positionals[0]!);
  if (extname(input) !== ".ts") {
    die(`expected a .ts file, got ${input}`);
  }

  const output = parsed.values.output
    ? resolve(parsed.values.output)
    : join(dirname(input), basename(input, ".ts"));

  const cPath = `${output}.c`;
  mkdirSync(dirname(output), { recursive: true });

  const graph = loadModuleGraph(input);
  const cSource = codegen(graph.files);
  writeFileSync(cPath, cSource);

  if (parsed.values["emit-c-only"]) {
    console.log(cPath);
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const runtimeDir = resolve(here, "..", "runtime");

  execFileSync(
    "cc",
    ["-O2", `-I${runtimeDir}`, "-Wall", "-Wextra", cPath, "-o", output],
    { stdio: "inherit" },
  );
}

try {
  main();
} catch (err) {
  if (err instanceof Error) die(err.message);
  throw err;
}
