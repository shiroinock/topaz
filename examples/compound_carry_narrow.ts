// Phase 1.5-6 prep #20: De Morgan carry narrowing for compound early-exit
// guards. When an `if` whose body always exits (return/throw/...) carries the
// inverse of its condition onto the statements that follow, a compound `&&` /
// `||` condition is split via De Morgan: `A || B` is false only when both A
// and B are false, and `A && B` is true only when both hold. So one operand's
// narrowing flows past the guard — exactly the shape `Parser.expectPunct` uses.

type Tok =
  | { kind: "punct"; op: string }
  | { kind: "ident"; name: string }
  | { kind: "eof" };

// `||` guard, body returns. De Morgan: skipping the early return means
// `t.kind === "punct" && t.op === op`, so `t` narrows to the `punct` variant
// and `t.op` is readable below the `if`.
function expectPunct(t: Tok, op: string): string {
  if (t.kind !== "punct" || t.op !== op) {
    return "<mismatch>";
  }
  return t.op;
}

// `&&` guard with an exiting `else`: reaching past the `if` means the `&&` was
// true, so the positive carry narrows `t` to the `punct` variant. The `then`
// body does not exit, so the carry attaches on the false-polarity-of-else side.
function classify(t: Tok): string {
  let prefix: string = "";
  if (t.kind === "punct" && t.op === "(") {
    prefix = "paren-";
  } else {
    return "<other>";
  }
  return prefix + t.op;
}

const toks: Array<Tok> = [
  { kind: "punct", op: "(" },
  { kind: "punct", op: ")" },
  { kind: "ident", name: "x" },
];

console.log(expectPunct(toks[0], "(")); // "("
console.log(expectPunct(toks[1], "(")); // <mismatch> (punct, wrong op)
console.log(expectPunct(toks[2], "(")); // <mismatch> (ident, not punct)

console.log(classify(toks[0])); // paren-(
console.log(classify(toks[1])); // <other> (punct but ")")
console.log(classify(toks[2])); // <other> (ident)
