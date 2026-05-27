// Phase 1.5-6 prep #19: compound-condition narrowing. The right operand of
// `&&` is evaluated under the left's positive narrowing, and the right of `||`
// under the left's negative narrowing. So a discriminator test `t.kind ===
// "op"` on the left of `&&` narrows the dunion `t` to that variant for the
// right operand, letting a variant-specific field be read without a `switch`.

type Tok =
  | { kind: "num"; value: number }
  | { kind: "op"; op: string }
  | { kind: "eof" };

// `&&`: left narrows `t` to the `op` variant, so `t.op` is readable on the right.
function isOp(t: Tok, sym: string): boolean {
  return t.kind === "op" && t.op === sym;
}

// `||`: the right operand runs when the left is false (i.e. `t.kind === "op"`),
// so the negative narrowing makes `t.op` readable on the right.
function notOpOr(t: Tok, sym: string): boolean {
  return t.kind !== "op" || t.op === sym;
}

// 2-variant complement: `t.kind !== "left"` true on the left of `&&` leaves only
// the `right` variant, so `t.rv` is readable on the right.
type Pair =
  | { kind: "left"; lv: number }
  | { kind: "right"; rv: number };

function isBigRight(t: Pair): boolean {
  return t.kind !== "left" && t.rv > 10;
}

// existing `T | undefined` narrowing now flows through the same `&&` path.
function hasLen(s: string | undefined): boolean {
  return s !== undefined && s.length > 0;
}

const toks: Array<Tok> = [
  { kind: "num", value: 42 },
  { kind: "op", op: "+" },
  { kind: "eof" },
];
console.log(isOp(toks[0], "+")); // false (num)
console.log(isOp(toks[1], "+")); // true
console.log(isOp(toks[1], "-")); // false (op, wrong sym)

console.log(notOpOr(toks[0], "+")); // true (not op)
console.log(notOpOr(toks[1], "+")); // true (op and matches)
console.log(notOpOr(toks[1], "-")); // false (op, mismatch)

const pairs: Array<Pair> = [
  { kind: "left", lv: 1 },
  { kind: "right", rv: 42 },
  { kind: "right", rv: 5 },
];
console.log(isBigRight(pairs[0])); // false (left short-circuits)
console.log(isBigRight(pairs[1])); // true (42 > 10)
console.log(isBigRight(pairs[2])); // false (5 <= 10)

console.log(hasLen("hi")); // true
console.log(hasLen("")); // false
console.log(hasLen(undefined)); // false
