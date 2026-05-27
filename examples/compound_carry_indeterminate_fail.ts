// Phase 1.5-6 prep #20: the carry of a compound condition is only sound on the
// determinate polarity. Here the `&&` guard's body exits and there is no
// `else`, so the carry polarity is false: `!(t.kind === "punct" && t.op ===
// "(")` is `t.kind !== "punct" || t.op !== "("`, which forces neither conjunct.
// No narrowing flows past the `if`, so the bare `t.op` below must be rejected
// (the dunion is still un-narrowed).

type Tok =
  | { kind: "punct"; op: string }
  | { kind: "eof" };

function bad(t: Tok): string {
  if (t.kind === "punct" && t.op === "(") {
    return "open";
  }
  return t.op;
}

console.log(bad({ kind: "eof" }));
