// Phase 1.5-6 prep #11: dunion as a contextual target for object literal
// expressions. Narrowing via the discriminator `kind: "..."` selects the
// matching anon-class variant; the result is then widened to the dunion via
// the existing class→dunion coercion in applyCoercion.
//
// Anon-class variants only (TypeLiteral / type alias of TypeLiteral). Concrete
// `class C { kind: "..."; ... }` variants still require `new C(...)` since
// object literal cannot recover positional ctor argument order.

type IdentToken = { kind: "ident"; text: string };
type NumberToken = { kind: "number"; value: number };
type EofToken = { kind: "eof" };

type Token = IdentToken | NumberToken | EofToken;

function tokenDescribe(t: Token): string {
  switch (t.kind) {
    case "ident":
      return `ident:${t.text}`;
    case "number":
      return `number:${t.value}`;
    case "eof":
      return "eof";
  }
  return "?";
}

// (1) Array<dunion>.push with object literal variants.
const tokens: Array<Token> = [];
tokens.push({ kind: "ident", text: "foo" });
tokens.push({ kind: "number", value: 42 });
tokens.push({ kind: "eof" });
console.log(tokens.length);
for (const t of tokens) {
  console.log(tokenDescribe(t));
}

// (2) Property order does not matter — anon class dedupe is alphabetical, and
// dunion narrowing picks the variant by the discriminator literal regardless
// of where it appears in the literal.
const reordered: Array<Token> = [];
reordered.push({ text: "bar", kind: "ident" });
reordered.push({ value: 7, kind: "number" });
console.log(tokenDescribe(reordered[0]));
console.log(tokenDescribe(reordered[1]));

// (3) Function parameter expecting a dunion accepts an object literal directly.
function describe(t: Token): string {
  return tokenDescribe(t);
}
console.log(describe({ kind: "ident", text: "baz" }));
console.log(describe({ kind: "number", value: 99 }));
console.log(describe({ kind: "eof" }));

// (4) Return-type contextual narrowing: a function returning Token can return
// an object literal directly.
function makeEof(): Token {
  return { kind: "eof" };
}
function makeIdent(s: string): Token {
  return { kind: "ident", text: s };
}
console.log(tokenDescribe(makeEof()));
console.log(tokenDescribe(makeIdent("hello")));

// (5) Array literal element contextual narrowing.
const literals: Array<Token> = [
  { kind: "ident", text: "a" },
  { kind: "number", value: 1 },
  { kind: "ident", text: "b" },
  { kind: "eof" },
];
console.log(literals.length);
for (const t of literals) {
  console.log(tokenDescribe(t));
}

// (6) Variable initializer with explicit annotation.
const single: Token = { kind: "ident", text: "lone" };
console.log(tokenDescribe(single));

// (7) Reassignment to a `let` Token variable keeps dunion narrowing per
// re-assignment site (each RHS literal selects its own variant).
let cur: Token = { kind: "eof" };
console.log(tokenDescribe(cur));
cur = { kind: "ident", text: "next" };
console.log(tokenDescribe(cur));
cur = { kind: "number", value: 555 };
console.log(tokenDescribe(cur));

// (8) Map<scalar, dunion> .set with object literal.
const m: Map<string, Token> = new Map<string, Token>();
m.set("a", { kind: "ident", text: "first" });
m.set("b", { kind: "number", value: 12 });
m.set("c", { kind: "eof" });
console.log(m.size);
console.log(m.has("a"));
console.log(m.has("z"));
