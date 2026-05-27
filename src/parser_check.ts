// Phase 1.5-6e parser harness: tsc + convertFromTsc を oracle、topaz_parser を
// candidate として、同じ .ts ソースから生成した SourceModule の JSON 等価を
// 検査する。
//
// 使い方:
//   node dist/parser_check.js <file.ts> [<file2.ts> ...]
//   exit 0 = 全 file 一致、exit 1 = 1 つでも diff、exit 2 = parse 失敗。
//
// 比較前に `pos` / `end` を除外する (両 parser の trivia 扱いが異なるため、
// span そのものは parser 単体検証の対象外。範囲指定がズレてもエラー位置を
// 出す精度の差にとどまり、ast の semantic な等価性とは独立)。

import { parseFile as tscParseFile } from "./parser.js";
import { parseFile as topazParseFile, ParseError } from "./topaz_parser.js";
import { convertFromTsc, ConvertError } from "./convert_from_tsc.js";

function stripSpans(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(stripSpans);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>)) {
    if (k === "pos" || k === "end") continue;
    out[k] = stripSpans((v as Record<string, unknown>)[k]);
  }
  return out;
}

type DiffResult = { path: string; oracle: unknown; candidate: unknown } | null;

function diff(a: unknown, b: unknown, path: string): DiffResult {
  if (a === b) return null;
  if (a === null || a === undefined || b === null || b === undefined) {
    return { path, oracle: a, candidate: b };
  }
  if (typeof a !== typeof b) {
    return { path, oracle: a, candidate: b };
  }
  if (typeof a !== "object") {
    return { path, oracle: a, candidate: b };
  }
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return { path, oracle: a, candidate: b };
  if (aIsArr && bIsArr) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) {
      return { path: `${path}.length`, oracle: arrA.length, candidate: arrB.length };
    }
    for (let i = 0; i < arrA.length; i++) {
      const sub = diff(arrA[i], arrB[i], `${path}[${i}]`);
      if (sub) return sub;
    }
    return null;
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(oa), ...Object.keys(ob)]);
  for (const k of keys) {
    if (!(k in oa)) return { path: `${path}.${k}`, oracle: undefined, candidate: ob[k] };
    if (!(k in ob)) return { path: `${path}.${k}`, oracle: oa[k], candidate: undefined };
    const sub = diff(oa[k], ob[k], `${path}.${k}`);
    if (sub) return sub;
  }
  return null;
}

function compareOne(file: string): boolean {
  let oracle: unknown;
  try {
    const sf = tscParseFile(file);
    oracle = stripSpans(convertFromTsc(sf));
  } catch (e) {
    if (e instanceof ConvertError) {
      console.error(`[oracle] ${file}: ConvertError ${e.message}`);
    } else {
      console.error(`[oracle] ${file}: ${(e as Error).message}`);
    }
    return false;
  }
  let candidate: unknown;
  try {
    candidate = stripSpans(topazParseFile(file));
  } catch (e) {
    if (e instanceof ParseError) {
      console.error(`[candidate] ${file}:${e.pos}: ${e.message}`);
    } else {
      console.error(`[candidate] ${file}: ${(e as Error).message}`);
    }
    return false;
  }
  const d = diff(oracle, candidate, "$");
  if (!d) {
    console.log(`OK ${file}`);
    return true;
  }
  console.error(`DIFF ${file} at ${d.path}`);
  console.error(`  oracle:    ${JSON.stringify(d.oracle)?.slice(0, 200)}`);
  console.error(`  candidate: ${JSON.stringify(d.candidate)?.slice(0, 200)}`);
  return false;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: parser_check <file.ts> [<file2.ts> ...]");
    process.exit(2);
  }
  let ok = true;
  for (const f of args) {
    if (!compareOne(f)) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

main();
