#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatCapabilityExplanation,
  formatModuleExplanation,
  knownCapabilityNames,
  knownModuleSpecifiers,
} from "./capability_explain.js";
import { CodegenError, codegen } from "./codegen.js";
import { formatDoctorReportForEntry } from "./doctor_report.js";
import { computeLineStarts, LexError, tokenize, Token } from "./lexer.js";
import { LoaderError, loadModuleGraph } from "./loader.js";
import {
  checkManifestPolicyForEntry,
  formatManifestCheckReport,
} from "./manifest_check.js";
import { manifestPolicyFilename } from "./manifest_policy.js";
import { ParseError } from "./topaz_parser.js";

function usageText(): string {
  return `usage: topaz <input.ts> [-o <output>] [--emit-c-only] [--lex-only] [--parse-only]
       topaz doctor <entry.ts>
       topaz check <entry.ts>
       topaz explain capability <name>
       topaz explain std/<module>

compile options:
  -o, --output <path>   output binary path (default: <input> with .ts stripped)
  --emit-c-only         emit the generated .c next to output and exit (skip cc)
  --lex-only            run only the Topaz lexer and dump tokens (skip parse/codegen/cc)
  --parse-only          unsupported/reserved in the self-host subset

doctor:
  read-only capability diagnostics for an entry source graph

check:
  read-only strict-ts.json coverage check for an entry source graph

explain:
  read-only embedded docs for capability names and builtin modules

options:
  -h, --help            show this help`;
}

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

function rawCliArgs(argv: Array<string>): Array<string> {
  return argv.slice(argvStartIndex(argv));
}

function runDoctorCommand(args: Array<string>): void {
  let entry = "";
  let hasEntry = false;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (
      arg === "-o" ||
      arg === "--output" ||
      arg === "--emit-c-only" ||
      arg === "--lex-only" ||
      arg === "--parse-only"
    ) {
      die(`doctor does not accept compile option ${arg}`);
    }
    if (arg.startsWith("-")) {
      die(`doctor does not accept option ${arg}`);
    }
    if (hasEntry) die(`unexpected positional argument ${arg}`);
    entry = arg;
    hasEntry = true;
    i = i + 1;
  }

  if (!hasEntry) die("doctor expects <entry.ts>");

  const resolvedEntry = resolve(entry);
  if (extname(resolvedEntry) !== ".ts") {
    die(`expected a .ts file, got ${resolvedEntry}`);
  }

  console.log(formatDoctorReportForEntry(resolvedEntry));
}

function runCheckCommand(args: Array<string>): void {
  let entry = "";
  let hasEntry = false;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (
      arg === "-o" ||
      arg === "--output" ||
      arg === "--emit-c-only" ||
      arg === "--lex-only" ||
      arg === "--parse-only"
    ) {
      die(`check does not accept compile option ${arg}`);
    }
    if (arg.startsWith("-")) {
      die(`check does not accept option ${arg}`);
    }
    if (hasEntry) die(`unexpected positional argument ${arg}`);
    entry = arg;
    hasEntry = true;
    i = i + 1;
  }

  if (!hasEntry) die("check expects <entry.ts>");

  const resolvedEntry = resolve(entry);
  if (extname(resolvedEntry) !== ".ts") {
    die(`expected a .ts file, got ${resolvedEntry}`);
  }

  const policyPath = join(dirname(resolvedEntry), manifestPolicyFilename());
  const result = checkManifestPolicyForEntry(resolvedEntry, policyPath);
  console.log(formatManifestCheckReport(result));
  if (!result.ok) {
    process.exit(1);
  }
}

function runExplainCommand(args: Array<string>): void {
  for (const arg of args) {
    if (
      arg === "-o" ||
      arg === "--output" ||
      arg === "--emit-c-only" ||
      arg === "--lex-only" ||
      arg === "--parse-only"
    ) {
      die(`explain does not accept compile option ${arg}`);
    }
    if (arg.startsWith("-")) {
      die(`explain does not accept option ${arg}`);
    }
  }

  if (args.length === 0) {
    die("explain expects capability <name> or std/<module>");
  }
  if (args[0] === "capability") {
    if (args.length < 2) die("explain capability expects <name>");
    const name = args[1];
    if (args.length > 2) die(`unexpected positional argument ${args[2]}`);

    const report = formatCapabilityExplanation(name);
    if (report === undefined) {
      die(`unknown capability ${name}; known capabilities: ${knownCapabilityNames().join(", ")}`);
    }
    console.log(report);
    return;
  }

  const specifier = args[0];
  if (args.length > 1) die(`unexpected positional argument ${args[1]}`);
  const report = formatModuleExplanation(specifier);
  if (report === undefined) {
    die(`unknown builtin module ${specifier}; known module specifiers: ${knownModuleSpecifiers().join(", ")}`);
  }
  console.log(report);
}

function main(): void {
  const rawArgs = rawCliArgs(process.argv);
  if (rawArgs.length > 0 && rawArgs[0] === "doctor") {
    runDoctorCommand(rawArgs.slice(1));
    return;
  }
  if (rawArgs.length > 0 && rawArgs[0] === "check") {
    runCheckCommand(rawArgs.slice(1));
    return;
  }
  if (rawArgs.length > 0 && rawArgs[0] === "explain") {
    runExplainCommand(rawArgs.slice(1));
    return;
  }

  const parsed = parseCliOptions(process.argv);

  if (parsed.help) {
    console.log(usageText());
    return;
  }
  const inputArg = parsed.input ?? "";
  if (parsed.input === undefined) {
    console.error(usageText());
    process.exit(2);
  }

  const input = resolve(inputArg);
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
    die("--parse-only JSON dump is unsupported in the self-host subset");
    return;
  }

  let output = join(dirname(input), basename(input, ".ts"));
  const outputArg = parsed.output ?? "";
  if (parsed.output !== undefined) {
    output = resolve(outputArg);
  }

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
      return `ident ${t.pos}-${t.end} ${dumpQuote(t.text)}`;
    case "number":
      return `number ${t.pos}-${t.end} ${dumpQuote(t.text)}`;
    case "bigint":
      return `bigint ${t.pos}-${t.end} ${dumpQuote(t.text)}`;
    case "string":
      return `string ${t.pos}-${t.end} ${dumpQuote(t.value)}`;
    case "template_head":
      return `template_head ${t.pos}-${t.end} ${dumpQuote(t.value)}`;
    case "template_middle":
      return `template_middle ${t.pos}-${t.end} ${dumpQuote(t.value)}`;
    case "template_tail":
      return `template_tail ${t.pos}-${t.end} ${dumpQuote(t.value)}`;
    case "template_full":
      return `template_full ${t.pos}-${t.end} ${dumpQuote(t.value)}`;
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

function lowerHexDigit(n: number): string {
  if (n < 10) return String.fromCharCode(48 + n);
  return String.fromCharCode(87 + n);
}

function lowerHexByte2(n: number): string {
  const lo = n % 16;
  const hi = (n - lo) / 16;
  return `${lowerHexDigit(hi)}${lowerHexDigit(lo)}`;
}

function dumpQuote(value: string): string {
  let out = "\"";
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x22) out += "\\\"";
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0d) out += "\\r";
    else if (c === 0x09) out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += `\\u00${lowerHexByte2(c)}`;
    else out += String.fromCharCode(c);
  }
  out += "\"";
  return out;
}

function formatSourceError(file: string, pos: number, message: string): string {
  const source = readFileSync(file, "utf8");
  const lineStarts = computeLineStarts(source);
  let lineIndex = 0;
  for (let i = 0; i < lineStarts.length; i++) {
    if (lineStarts[i] > pos) break;
    lineIndex = i;
  }
  return `${file}:${lineIndex + 1}:${pos - lineStarts[lineIndex] + 1}: ${message}`;
}

try {
  main();
} catch (err) {
  if (err instanceof ParseError) die(formatSourceError(err.file, err.pos, err.message));
  if (err instanceof LexError) die(formatSourceError(err.file, err.pos, err.message));
  if (err instanceof LoaderError) die(err.message);
  if (err instanceof CodegenError) die(err.message);
  die("internal error: unhandled exception");
}
