// Phase 1.5-6 prep: optional parameter `param?: T` as syntactic sugar for
// `param: T | undefined`. Callers may omit trailing optional args; the
// codegen auto-fills `undefined` for each missing slot. Inside the function
// body the param is `T | undefined` and must be narrowed before use.
// Optional members of object literal types (`type X = { f?: T }`) follow
// the same model: missing fields in the literal auto-fill to undefined.

// (1) Plain function with a single optional trailing param. Call site may
//     omit the arg (auto-fill undefined) or pass it explicitly.
function greet(name: string, suffix?: string): string {
  if (suffix !== undefined) return name + suffix;
  return name;
}
console.log(greet("topaz"));            // topaz
console.log(greet("topaz", "!"));       // topaz!

// (2) Two optional params, omit either-or-both trailing slots.
function pad(n: number, width?: number, fill?: string): string {
  const w: number = width ?? 4;
  const f: string = fill ?? "0";
  let out: string = `${n}`;
  while (out.length < w) out = f + out;
  return out;
}
console.log(pad(7));                     // 0007 (both omitted)
console.log(pad(7, 2));                  // 07   (only width)
console.log(pad(7, 5, "*"));             // ****7 (both supplied)

// (3) Class method with an optional param. Same arity-flex rule.
class Counter {
  v: number = 0;
  bump(step?: number): void {
    this.v = this.v + (step ?? 1);
  }
}
const c: Counter = new Counter();
c.bump();              // step omitted, defaults to 1
c.bump();              // ditto
c.bump(10);            // explicit 10
console.log(c.v);      // 12

// (4) Constructor with an optional param. Auto-fill at `new` site.
class Box {
  value: number;
  label: string;
  constructor(value: number, label?: string) {
    this.value = value;
    this.label = label ?? "anon";
  }
}
const b1: Box = new Box(1);
const b2: Box = new Box(2, "named");
console.log(b1.value);   // 1
console.log(b1.label);   // anon
console.log(b2.value);   // 2
console.log(b2.label);   // named

// (5) Object literal type with an optional field — omit / supply.
type Config = { host: string; port?: number };
function show(cfg: Config): string {
  const p: number = cfg.port ?? 80;
  return `${cfg.host}:${p}`;
}
const cfgA: Config = { host: "a" };
const cfgB: Config = { host: "b", port: 9000 };
console.log(show(cfgA));   // a:80
console.log(show(cfgB));   // b:9000

// (6) Object literal type with multiple optional fields, varying coverage.
type Range = { lo: number; hi?: number; step?: number };
function span(r: Range): number {
  const hi: number = r.hi ?? r.lo;
  const step: number = r.step ?? 1;
  return (hi - r.lo) * step;
}
const r1: Range = { lo: 5 };
const r2: Range = { lo: 5, hi: 10 };
const r3: Range = { lo: 5, hi: 10, step: 3 };
console.log(span(r1));   // 0
console.log(span(r2));   // 5
console.log(span(r3));   // 15

// (7) Optional parameter narrowed with `if (x !== undefined)`.
function maybeDouble(x: number, factor?: number): number {
  if (factor !== undefined) return x * factor;
  return x * 2;
}
console.log(maybeDouble(5));        // 10
console.log(maybeDouble(5, 7));     // 35

// (8) Optional param with class type — auto-fill must produce a NULL ptr.
class Tag {
  text: string;
  constructor(t: string) {
    this.text = t;
  }
}
function tagged(label: string, tag?: Tag): string {
  if (tag !== undefined) return label + "[" + tag.text + "]";
  return label;
}
console.log(tagged("hi"));               // hi
console.log(tagged("hi", new Tag("x"))); // hi[x]

// (9) Optional object literal field with class type — reference / NULL.
//     Use `?.` for the absent / present projection (anon class field is
//     `Tag | undefined`); narrowing through `.tag` directly requires
//     property-access narrowing which we don't (yet) do.
type Slot = { id: number; tag?: Tag };
const s1: Slot = { id: 1 };
const s2: Slot = { id: 2, tag: new Tag("y") };
console.log(s1.id);                      // 1
console.log(s2.id);                      // 2
const s1tag: string | undefined = s1.tag?.text;
const s2tag: string | undefined = s2.tag?.text;
console.log(s1tag ?? "none");            // none
console.log(s2tag ?? "none");            // y

// (10) Optional param + ?? chain returning the param's `T | undefined`
//      value flowing back through a narrowed coalesce.
function chooseLabel(primary?: string, fallback?: string): string {
  return primary ?? fallback ?? "default";
}
console.log(chooseLabel());                // default
console.log(chooseLabel("only"));          // only
console.log(chooseLabel(undefined, "fb")); // fb
console.log(chooseLabel("p", "f"));        // p
