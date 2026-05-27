// Phase 1.5-6 prep: condition 省略形 `for (;;)`(無限ループ)。
// init / condition / incrementor のいずれも省略可能 — condition 省略時は C の
// 空 middle clause をそのまま emit し、body 内の break / return / throw で抜ける。
// topaz_parser.ts:570 の `for (;;)` blocker を解消するサブステップの回帰。

// (1) 全省略形 — counter を body 内で進めて break
let total: number = 0;
let i: number = 0;
for (;;) {
  if (i >= 5) {
    break;
  }
  total = total + i;
  i = i + 1;
}
console.log(total); // 0+1+2+3+4 = 10

// (2) condition だけ省略(init / incrementor はあり)
let prod: number = 1;
for (let k: number = 1; ; k = k + 1) {
  if (k > 4) {
    break;
  }
  prod = prod * k;
}
console.log(prod); // 1*2*3*4 = 24

// (3) init / incrementor 省略(condition あり)— 既存サポートの網羅
let n: number = 16;
let halves: number = 0;
for (; n > 1; ) {
  n = n / 2;
  halves = halves + 1;
}
console.log(halves); // 4

// (4) continue が無限ループでも従来通り効く
let acc: number = 0;
let m: number = 0;
for (;;) {
  m = m + 1;
  if (m > 10) {
    break;
  }
  if (m % 2 === 0) {
    continue;
  }
  acc = acc + m;
}
console.log(acc); // 1+3+5+7+9 = 25
