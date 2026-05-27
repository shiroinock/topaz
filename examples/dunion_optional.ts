// Phase 1.5-6 prep #15: `T | undefined` for T = dunion (discriminated class
// union). C representation is the same `{ kind, data }` fat struct; the
// `.data == NULL` zero-initialized form is the absent sentinel — distinct
// from any wrapped variant whose `.data` always points to a calloc'd class
// instance. Exercises construction, narrowing (=== / !==), `!`, `??`,
// function param / return, and Map.get with a dunion value type.

class Ident {
  kind: "ident";
  text: string;
  constructor(t: string) {
    this.kind = "ident";
    this.text = t;
  }
}

class NumLit {
  kind: "num";
  n: number;
  constructor(n: number) {
    this.kind = "num";
    this.n = n;
  }
}

class Eof {
  kind: "eof";
  constructor() {
    this.kind = "eof";
  }
}

type Tok = Ident | NumLit | Eof;

// (1) Plain `Tok | undefined` variable, widening from a concrete class via
// the dunion intermediate.
let cur: Tok | undefined = new Ident("foo");
if (cur !== undefined) {
  switch (cur.kind) {
    case "ident":
      console.log(`ident=${cur.text}`);
      break;
    case "num":
      console.log(`num=${cur.n}`);
      break;
    case "eof":
      console.log("eof");
      break;
  }
}

// (2) Re-assignment to undefined and back, then narrowing.
cur = undefined;
if (cur === undefined) {
  console.log("absent");
}
cur = new NumLit(42);
if (cur !== undefined) {
  switch (cur.kind) {
    case "ident":
      console.log(`ident=${cur.text}`);
      break;
    case "num":
      console.log(`num=${cur.n}`);
      break;
    case "eof":
      console.log("eof");
      break;
  }
}

// (3) Function parameter `Tok | undefined`, body narrows.
function describe(t: Tok | undefined): string {
  if (t === undefined) {
    return "none";
  }
  switch (t.kind) {
    case "ident":
      return `i:${t.text}`;
    case "num":
      return `n:${t.n}`;
    case "eof":
      return "eof";
  }
  return "?";
}
console.log(describe(new Ident("hello")));
console.log(describe(new NumLit(7)));
console.log(describe(new Eof()));
console.log(describe(undefined));

// (4) Function returning `Tok | undefined`.
function lookup(tag: number): Tok | undefined {
  if (tag === 1) return new Ident("a");
  if (tag === 2) return new NumLit(99);
  if (tag === 3) return new Eof();
  return undefined;
}
console.log(describe(lookup(1)));
console.log(describe(lookup(2)));
console.log(describe(lookup(3)));
console.log(describe(lookup(999)));

// (5) Map<scalar, dunion>: prep #8 enabled the storage; with prep #15 the
// `.get` narrowing now works for dunion V.
const tokens: Map<string, Tok> = new Map<string, Tok>();
tokens.set("alpha", new Ident("alpha-text"));
tokens.set("num", new NumLit(123));
tokens.set("end", new Eof());

const got1: Tok | undefined = tokens.get("alpha");
if (got1 !== undefined) {
  switch (got1.kind) {
    case "ident":
      console.log(`got:${got1.text}`);
      break;
    case "num":
      console.log(`got:${got1.n}`);
      break;
    case "eof":
      console.log("got:eof");
      break;
  }
}
const missing: Tok | undefined = tokens.get("nope");
if (missing === undefined) {
  console.log("miss");
}

// (6) `!` (non-null assertion) on a known-present dunion | undefined.
const got2: Tok | undefined = tokens.get("num");
const tok2: Tok = got2!;
switch (tok2.kind) {
  case "ident":
    console.log(`bang:${tok2.text}`);
    break;
  case "num":
    console.log(`bang:${tok2.n}`);
    break;
  case "eof":
    console.log("bang:eof");
    break;
}

// (7) `??` (nullish coalescing) with a concrete dunion fallback.
const fallback: Tok = new Eof();
const got3: Tok = tokens.get("missing") ?? fallback;
switch (got3.kind) {
  case "ident":
    console.log(`nc:${got3.text}`);
    break;
  case "num":
    console.log(`nc:${got3.n}`);
    break;
  case "eof":
    console.log("nc:eof");
    break;
}

// (8) `??` chain producing `Tok | undefined` in the middle.
const chain: Tok | undefined = tokens.get("none") ?? tokens.get("alpha") ?? undefined;
if (chain !== undefined) {
  switch (chain.kind) {
    case "ident":
      console.log(`chain:${chain.text}`);
      break;
    case "num":
      console.log(`chain:${chain.n}`);
      break;
    case "eof":
      console.log("chain:eof");
      break;
  }
}

// (9) Reference identity: the dunion struct's `.data` survives the
// `T | undefined` round trip (the absent sentinel is `.data == NULL`, not
// any zero-initialized class instance). Two separate `.get("alpha")` calls
// return dunion structs wrapping the same underlying class instance.
const same: Tok = tokens.get("alpha")!;
const again: Tok = tokens.get("alpha")!;
if (same.kind === again.kind) {
  console.log("id-match");
}
