// Phase 1.5-6 prep #19: when the left operand of `&&` narrows to a *different*
// variant than the field belongs to (here `num`, not `op`), the right operand
// still cannot read the variant-specific field — the narrowing is honored, not
// bypassed. Rejected the same way an unnarrowed access is.

type Tok =
  | { kind: "num"; value: number }
  | { kind: "op"; op: string };

function bad(t: Tok, sym: string): boolean {
  return t.kind === "num" && t.op === sym;
}

console.log(bad({ kind: "op", op: "+" }, "+"));
