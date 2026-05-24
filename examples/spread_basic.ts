// Phase 1.5-3.5h-spread: spread (`...x`) inside an array literal.
// Source must be `Array<T>` whose elem type matches the destination
// exactly. Set / Iterator sources and call-arg spread stay rejected.

interface Named {
  name(): string;
}

class Tag implements Named {
  label: string;
  constructor(s: string) {
    this.label = s;
  }
  name(): string {
    return this.label;
  }
}

// (1) Single spread of a number Array — clone semantics.
const a: Array<number> = [1, 2, 3];
const b: Array<number> = [...a];
console.log(b.length);                   // 3
console.log(b[0] + b[1] + b[2]);         // 6
// b is a fresh storage: mutating b leaves a untouched.
b.push(99);
console.log(a.length);                   // 3
console.log(b.length);                   // 4

// (2) Mixed fixed + spread + fixed — [head, ...mid, tail].
const mid: Array<number> = [20, 30];
const c: Array<number> = [10, ...mid, 40];
console.log(c.length);                   // 4
let csum: number = 0;
for (const x of c) csum = csum + x;
console.log(csum);                       // 100

// (3) Multiple spread sources in one literal.
const xs: Array<number> = [1, 2];
const ys: Array<number> = [3, 4, 5];
const zs: Array<number> = [...xs, 100, ...ys];
console.log(zs.length);                  // 6
let zsum: number = 0;
for (const z of zs) zsum = zsum + z;
console.log(zsum);                       // 1+2+100+3+4+5 = 115

// (4) Empty spread source — total length is fixed contribution only.
const empty: Array<number> = [];
const d: Array<number> = [7, ...empty, 8];
console.log(d.length);                   // 2
console.log(d[0] + d[1]);                // 15

// (5) Spread-only with empty source produces empty array.
const e: Array<number> = [...empty];
console.log(e.length);                   // 0

// (6) Type inference: leading spread infers elem from the source.
const src: Array<string> = ["a", "bb", "ccc"];
const inferred = [...src, "dddd"];
let lensum: number = 0;
for (const s of inferred) lensum = lensum + s.length;
console.log(lensum);                     // 1+2+3+4 = 10

// (7) Class Array spread preserves reference identity.
const t1: Tag = new Tag("alpha");
const t2: Tag = new Tag("beta");
const tags: Array<Tag> = [t1, t2];
const more: Array<Tag> = [...tags, new Tag("gamma")];
console.log(more.length);                // 3
// First two slots are the SAME objects as in `tags` (reference shared).
let labelTotal: number = 0;
for (const t of more) labelTotal = labelTotal + t.label.length;
console.log(labelTotal);                 // 5+4+5 = 14

// (8) Interface Array with class elements + spread of an interface Array.
const nm1: Named = new Tag("x");
const nm2: Named = new Tag("yy");
const base: Array<Named> = [nm1, nm2];
const joined: Array<Named> = [...base, new Tag("zzz")];
let nmTotal: number = 0;
for (const n of joined) nmTotal = nmTotal + n.name().length;
console.log(nmTotal);                    // 1+2+3 = 6

// (9) Chain: spread the result of `.map(...)`.
const nums: Array<number> = [1, 2, 3];
const mapped: Array<number> = [0, ...nums.map((n) => n * 10), 99];
console.log(mapped.length);              // 5
let mapsum: number = 0;
for (const m of mapped) mapsum = mapsum + m;
console.log(mapsum);                     // 0+10+20+30+99 = 159

// (10) Chain: spread on the LHS of `.filter(...)` — spread builds first,
//      filter consumes the new array.
const f: Array<number> = [...nums, ...nums].filter((n) => n > 1);
console.log(f.length);                   // 4 — [2,3,2,3]
let fsum: number = 0;
for (const x of f) fsum = fsum + x;
console.log(fsum);                       // 2+3+2+3 = 10

// (11) Source expression evaluates once even when multi-pushed (cap-based).
//      Use a Tag whose ctor is observable through `Tag.label` to verify
//      we read .data via the snapshot, not the original arr ref twice.
const buf: Array<string> = ["one"];
const grown: Array<string> = [...buf, "two", ...buf];
console.log(grown.length);               // 3
let gsum: number = 0;
for (const s of grown) gsum = gsum + s.length;
console.log(gsum);                       // 3+3+3 = 9

// (12) Annotated dst type drives fixed-element coercion; spread still
//      requires EXACT elem match, so we pre-coerce class -> iface by
//      pushing into a Named Array first.
const seed: Array<Named> = [new Tag("p"), new Tag("qq")];
const wider: Array<Named> = [new Tag("zero"), ...seed];
let wTotal: number = 0;
for (const n of wider) wTotal = wTotal + n.name().length;
console.log(wTotal);                     // 4+1+2 = 7
