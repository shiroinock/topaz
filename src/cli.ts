#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { codegen } from "./codegen.js";
import { computeLineStarts, LexError, tokenize, type Token } from "./lexer.js";
import { LoaderError, loadModuleGraph } from "./loader.js";
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

class CliOptions {
  input: string | undefined;
  output: string | undefined;
  emitCOnly: boolean;
  lexOnly: boolean;
  parseOnly: boolean;
  help: boolean;

  constructor() {
    this.input = undefined;
    this.output = undefined;
    this.emitCOnly = false;
    this.lexOnly = false;
    this.parseOnly = false;
    this.help = false;
  }
}

function argvStartIndex(argv: Array<string>): number {
  if (argv.length >= 2) {
    const script = argv[1];
    if (script.endsWith(".js")) return 2;
  }
  return 1;
}

function parseCliOptions(argv: Array<string>): CliOptions {
  const opts = new CliOptions();
  let i = argvStartIndex(argv);
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
      i = i + 1;
    } else if (arg === "--emit-c-only") {
      opts.emitCOnly = true;
      i = i + 1;
    } else if (arg === "--lex-only") {
      opts.lexOnly = true;
      i = i + 1;
    } else if (arg === "--parse-only") {
      opts.parseOnly = true;
      i = i + 1;
    } else if (arg === "-o" || arg === "--output") {
      if (i + 1 >= argv.length) die(`${arg} expects a value`);
      opts.output = argv[i + 1];
      i = i + 2;
    } else if (arg.startsWith("-")) {
      die(`unknown option ${arg}`);
    } else {
      if (opts.input !== undefined) die(`unexpected positional argument ${arg}`);
      opts.input = arg;
      i = i + 1;
    }
  }
  return opts;
}

function main(): void {
  const parsed = parseCliOptions(process.argv);

  if (parsed.help) {
    console.log(USAGE);
    return;
  }
  if (parsed.input === undefined) {
    console.error(USAGE);
    process.exit(2);
  }

  const input = resolve(parsed.input);
  if (extname(input) !== ".ts") {
    die(`expected a .ts file, got ${input}`);
  }

  if (parsed.lexOnly) {
    const source = readFileSync(input, "utf8");
    const tokens = tokenize(source, input);
    for (const t of tokens) {
      process.stdout.write(formatToken(t) + "\n");
    }
    return;
  }

  if (parsed.parseOnly) {
    const mod = topazParseFile(input);
    process.stdout.write(JSON.stringify(mod, null, 2) + "\n");
    return;
  }

  const output = parsed.output !== undefined
    ? resolve(parsed.output)
    : join(dirname(input), basename(input, ".ts"));

  const cPath = `${output}.c`;
  mkdirSync(dirname(output), { recursive: true });

  const graph = loadModuleGraph(input);
  // Phase 1.5-6g-1: loader returns Topaz `SourceModule[]`; normal compile no
  // longer uses the tsc bridge.
  const cSource = codegen(graph.files);
  writeFileSync(cPath, cSource);

  if (parsed.emitCOnly) {
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
  if (err instanceof LoaderError) die(err.message);
  if (err instanceof Error) die(err.message);
  throw err;
}
