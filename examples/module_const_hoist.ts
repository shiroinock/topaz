// Phase 1.5-6 prep #9: module-level `const NAME: T = LIT;` with scalar
// literal initializer is hoisted to file-static `static const T NAME = LIT;`
// so user-defined static C functions (plain fn / class method / interface
// vtable wrapper) can resolve the binding via scope.stack[0]. Without the
// hoist, top-level consts live only in main()'s frame and any function body
// referencing them throws "unknown identifier" at codegen time.

// (1) plain fn body references hoisted number const.
const CHAR_0: number = 48;
const CHAR_9: number = 57;

function isDigit(c: number): boolean {
  return c >= CHAR_0 && c <= CHAR_9;
}

console.log(isDigit(50));   // true  (codepoint of '2')
console.log(isDigit(47));   // false (codepoint just below '0')
console.log(isDigit(57));   // true  ('9')
console.log(isDigit(58));   // false (just past '9')

// (2) boolean literal hoist + function reads it.
const DEBUG_ON: boolean = true;
const DEBUG_OFF: boolean = false;

function pickDebug(): boolean {
  return DEBUG_ON && !DEBUG_OFF;
}

console.log(pickDebug());   // true
console.log(DEBUG_ON);      // true (also readable from main body)

// (3) unary minus on numeric literal.
const NEG_ONE: number = -1;
const POSITIVE: number = +42;

function offset(base: number): number {
  return base + NEG_ONE + POSITIVE;
}

console.log(offset(10));    // 51
console.log(NEG_ONE);       // -1
console.log(POSITIVE);      // 42

// (4) class method body references hoisted const.
const SCALE: number = 10;

class Scaler {
  base: number;
  constructor(base: number) {
    this.base = base;
  }
  scaled(): number {
    return this.base * SCALE;
  }
}

const s = new Scaler(7);
console.log(s.scaled());    // 70

// (5) hoisted const shadowed by an inner local — inner wins, outer still
// visible elsewhere.
const LIMIT: number = 100;

function clamp(v: number): number {
  const LIMIT: number = 5;  // local shadows hoisted
  if (v > LIMIT) return LIMIT;
  return v;
}

console.log(clamp(3));      // 3  (under inner limit)
console.log(clamp(50));     // 5  (capped by inner limit, not the hoisted 100)
console.log(LIMIT);         // 100 (outer still intact)

// (6) interface vtable wrapper path: class implements an interface whose
// method body reads the hoisted const. The wrapper is a separate static C
// function — needs the hoisted binding visible from there too.
const PAD: number = 3;

interface Adder {
  add(n: number): number;
}

class PaddedAdder implements Adder {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  add(n: number): number {
    return n + this.seed + PAD;
  }
}

const a: Adder = new PaddedAdder(1);
console.log(a.add(7));      // 11
console.log(a.add(0));      // 4

// (7) main() body still treats non-hoistable consts normally. A class-typed
// const (`new C(...)` initializer) stays in main() body — exercised by (4)
// above (`const s = new Scaler(7)`).

// (8) hoisted number captured into an arrow inside main — arrow's env walk
// resolves the reference via stack[0] (no env entry needed because the
// binding lives at file scope).
const BASE: number = 1000;

const xs: Array<number> = [500, 1500, 999, 1001];
const big: Array<number> = xs.filter((x) => x > BASE);
console.log(big.length);    // 2
console.log(big[0]);        // 1500
