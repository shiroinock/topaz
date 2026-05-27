// Phase 1.5-6 prep: closure 越えの dunion narrowing 伝播。
// ternary `cond ? a : (() => {...})()` の condition が外側の dunion 識別子を
// narrow した時、その narrowing を IIFE arm の closure body にも届ける。capture
// 解析(lookupAcrossBarrier)が narrowing-aware になり、構築時点で有効な narrowed
// 型を env field 型として記録する — capture は値コピーなので narrowing は健全。
// narrowed 型はそのまま env field の C 型・初期化子(emitCapturedIdentifier)・
// closure body 内の inferType(captureContext 経由)に一貫して流れる。
// topaz_parser.ts:1594 (parseArrow の endPos 計算、`body.kind === "arrow_expr_body"
// ? body.expr.end : (() => { const ss = body.stmts; ... })()`) の blocker を解消
// するサブステップの回帰。variant は self-host と同じ anon-class dunion。

type Body =
  | { kind: "expr"; value: number }
  | { kind: "block"; items: Array<number> };

// (1) blocker shape: ternary false-arm IIFE reads the BlockBody-only field
// `items` through a capture of the narrowed `body`.
function lastValue(body: Body): number {
  const v: number = body.kind === "expr" ? body.value : (() => {
    const items: Array<number> = body.items;
    if (items.length === 0) return 0;
    return items[items.length - 1];
  })();
  return v;
}

// (2) ternary true-arm IIFE — the narrowing reaches the other arm too.
function firstOrValue(body: Body): number {
  const v: number = body.kind === "block" ? (() => {
    const items: Array<number> = body.items;
    if (items.length === 0) return -1;
    return items[0];
  })() : body.value;
  return v;
}

// (3) if-narrowing carried into an IIFE constructed inside the then-block —
// the general case, not just ternary arms.
function blockCount(body: Body): number {
  if (body.kind === "block") {
    const n: number = (() => {
      return body.items.length;
    })();
    return n;
  }
  return body.value;
}

const e: Body = { kind: "expr", value: 42 };
const b: Body = { kind: "block", items: [10, 20, 30] };
console.log(lastValue(e)); // 42
console.log(lastValue(b)); // 30
console.log(firstOrValue(e)); // 42
console.log(firstOrValue(b)); // 10
console.log(blockCount(e)); // 42
console.log(blockCount(b)); // 3
