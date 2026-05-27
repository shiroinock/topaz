// Phase 1.5-6 prep: object literal property shorthand。`{ a }` は `{ a: a }`
// の desugar で、property 名がそのまま現スコープの identifier 参照を兼ねる。
// emitWithExpected の anon-class path で ShorthandPropertyAssignment を
// `prop.name` を値式として扱う形で受理。method shorthand / getter-setter /
// spread / `{ x = default }` は引き続き reject。

type Pair = { a: number; b: number };

// (1) 純粋な shorthand。
const a: number = 1;
const b: number = 2;
const p: Pair = { a, b };
console.log(p.a);            // 1
console.log(p.b);            // 2

// (2) shorthand でも順序反転 OK(alphabetical sort で positional ctor に並ぶ)。
const p2: Pair = { b, a };
console.log(p2.a);           // 1
console.log(p2.b);           // 2

// (3) shorthand と explicit の混在。
const c: number = 10;
const m: Pair = { a: c, b };
console.log(m.a);            // 10
console.log(m.b);            // 2

// (4) string + number の shorthand。
type Person = { age: number; name: string };
const name: string = "alice";
const age: number = 30;
const pe: Person = { name, age };
console.log(pe.name);        // alice
console.log(pe.age);         // 30

// (5) Array<anon> への push 引数中の shorthand。
type Hit = { label: string; score: number };
const hits: Array<Hit> = [];
const score: number = 42;
const label: string = "hot";
hits.push({ score, label });
console.log(hits[0].score);  // 42
console.log(hits[0].label);  // hot

// (6) arrow closure に捕捉される shorthand。property 名は scope 参照を兼ねるので
//     capture 解析が shorthand identifier を reference として追える必要がある。
function closureDemo(): void {
  const a: number = 7;
  const mk = (b: number): Pair => {
    return { a, b };         // `a` は捕捉変数、`b` は arrow param、どちらも shorthand
  };
  const cp = mk(99);
  console.log(cp.a);         // 7
  console.log(cp.b);         // 99
}
closureDemo();
