#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { codegen } from "./codegen.js";
import { computeLineStarts, LexError, tokenize, type Token } from "./lexer.js";
import { loadModuleGraph } from "./loader.js";
import { ParseError, parseFile as topazParseFile } from "./topaz_parser.js";

const USAGE = `usage: topaz <input.ts> [-o <output>] [--emit-c-only] [--lex-only] [--parse-only]

options:
  -o, --output <path>   output binary path (default: <input> with .ts stripped)
  --emit-c-only         emit the generated .c next to output and exit (skip cc)
  --lex-only            run only the Topaz lexer and dump tokens (skip parse/codegen/cc)
  --parse-only          run lexer + parser and dump AST as JSON (skip codegen/cc)
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
      "lex-only": { type: "boolean" },
      "parse-only": { type: "boolean" },
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

  if (parsed.values["lex-only"]) {
    const source = readFileSync(input, "utf8");
    const tokens = tokenize(source, input);
    for (const t of tokens) {
      process.stdout.write(formatToken(t) + "\n");
    }
    return;
  }

  if (parsed.values["parse-only"]) {
    const mod = topazParseFile(input);
    process.stdout.write(JSON.stringify(mod, null, 2) + "\n");
    return;
  }

  const output = parsed.values.output
    ? resolve(parsed.values.output)
    : join(dirname(input), basename(input, ".ts"));

  const cPath = `${output}.c`;
  mkdirSync(dirname(output), { recursive: true });

  const graph = loadModuleGraph(input);
  // Phase 1.5-6g-1: loader returns Topaz `SourceModule[]`; normal compile no
  // longer uses the tsc bridge.
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

function formatToken(t: Token): string {
  switch (t.kind) {
    case "ident":
      return `ident ${t.pos}-${t.end} ${JSON.stringify(t.text)}`;
    case "number":
      return `number ${t.pos}-${t.end} ${JSON.stringify(t.text)}`;
    case "string":
      return `string ${t.pos}-${t.end} ${JSON.stringify(t.value)}`;
    case "template_head":
      return `template_head ${t.pos}-${t.end} ${JSON.stringify(t.value)}`;
    case "template_middle":
      return `template_middle ${t.pos}-${t.end} ${JSON.stringify(t.value)}`;
    case "template_tail":
      return `template_tail ${t.pos}-${t.end} ${JSON.stringify(t.value)}`;
    case "template_full":
      return `template_full ${t.pos}-${t.end} ${JSON.stringify(t.value)}`;
    case "punct":
      return `punct ${t.pos}-${t.end} ${t.op}`;
    case "keyword":
      return `keyword ${t.pos}-${t.end} ${t.word}`;
    case "newline":
      return `newline ${t.pos}-${t.end}`;
    case "eof":
      return `eof ${t.pos}`;
  }
}

function formatSourceError(file: string, pos: number, message: string): string {
  const source = readFileSync(file, "utf8");
  const lineStarts = computeLineStarts(source);
  let lineIndex = 0;
  for (let i = 0; i < lineStarts.length; i++) {
    if (lineStarts[i]! > pos) break;
    lineIndex = i;
  }
  return `${file}:${lineIndex + 1}:${pos - lineStarts[lineIndex]! + 1}: ${message}`;
}

try {
  main();
} catch (err) {
  if (err instanceof ParseError) die(formatSourceError(err.file, err.pos, err.message));
  if (err instanceof LexError) die(formatSourceError(err.file, err.pos, err.message));
  if (err instanceof Error) die(err.message);
  throw err;
}
