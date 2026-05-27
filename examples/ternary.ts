// Phase 1.5-6 prep #25: conditional (ternary) `cond ? a : b`。
// condition は厳格 boolean、各 branch は condition が含む narrowing 下で emit
// (true arm = positive / false arm = negative)、両 arm は共通 target 型へ
// emitWithExpected で寄せて C ternary の両オペランドの型を一致させる。
// topaz_parser.ts:634 の三項演算子 blocker を解消するサブステップの回帰。

// (1) 変数初期化 + 比較条件 + 数値 branch
let a: number = 5;
let b: number = a > 3 ? 10 : 20;
console.log(b); // 10

// (2) string branch
let flag: boolean = false;
let s: string = flag ? "yes" : "no";
console.log(s); // no

// (3) return site + `T | undefined` の narrowing(true arm で x を狭める)
function pick(x: number | undefined): number {
  return x !== undefined ? x : -1;
}
console.log(pick(42)); // 42
console.log(pick(undefined)); // -1

// (4) chained ternary(false arm が再び ternary)
function classify(n: number): string {
  return n < 0 ? "neg" : n === 0 ? "zero" : "pos";
}
console.log(classify(-5)); // neg
console.log(classify(0)); // zero
console.log(classify(7)); // pos

// (5) 関数引数 site
function dbl(n: number): number {
  return n * 2;
}
let cond: boolean = true;
console.log(dbl(cond ? 4 : 9)); // 8

// (6) 代入 RHS + branch 内で narrowed field access
class Box {
  value: number;
  constructor(v: number) {
    this.value = v;
  }
}
function readBox(box: Box | undefined): number {
  let r: number = 0;
  r = box !== undefined ? box.value : 100;
  return r;
}
console.log(readBox(new Box(77))); // 77
console.log(readBox(undefined)); // 100

// (7) self-host blocker と同型: `a !== undefined ? a.f : (b !== undefined ? b.f : c)`
function endPos(p: Box | undefined, q: Box | undefined, fallback: number): number {
  return p !== undefined ? p.value : (q !== undefined ? q.value : fallback);
}
console.log(endPos(new Box(1), undefined, 9)); // 1
console.log(endPos(undefined, new Box(2), 9)); // 2
console.log(endPos(undefined, undefined, 9)); // 9

// (8) bare-undefined branch -> 結果は `number | undefined`、その後 narrow して使う
function maybe(keep: boolean, n: number): number {
  let opt: number | undefined = keep ? n : undefined;
  return opt !== undefined ? opt : -7;
}
console.log(maybe(true, 33)); // 33
console.log(maybe(false, 33)); // -7
