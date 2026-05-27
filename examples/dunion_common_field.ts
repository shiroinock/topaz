// Phase 1.5-6 prep #16: a field shared by every variant of a discriminated
// union, with one identical type, is readable without narrowing — the same
// common-property access TS allows. emit dispatches on the variant tag to
// cast `.data` to the matching variant before the read. Here `pos` (number)
// and `note` (string) are common; `value` / `op` are variant-specific and
// still require `switch (t.kind)` narrowing.

type Tok =
  | { kind: "num"; pos: number; note: string; value: number }
  | { kind: "op"; pos: number; note: string; op: string }
  | { kind: "eof"; pos: number; note: string };

function kindOf(t: Tok): string {
  return t.kind; // discriminator: read straight off the fat struct
}

function summary(t: Tok): string {
  // two common-field reads (number + string) with no narrowing
  return `${t.note}@${t.pos}`;
}

function detail(t: Tok): string {
  switch (t.kind) {
    case "num":
      return `num(${t.value})`;
    case "op":
      return `op(${t.op})`;
    case "eof":
      return "eof";
  }
  return "?";
}

const toks: Array<Tok> = [
  { kind: "num", pos: 0, note: "a", value: 42 },
  { kind: "op", pos: 3, note: "b", op: "+" },
  { kind: "eof", pos: 5, note: "c" },
];
for (const t of toks) {
  console.log(`${kindOf(t)} ${summary(t)} ${detail(t)}`);
}
// common-field read off an array element (non-identifier base): the stmt-expr
// snapshots `.data` once so the element access is not duplicated.
console.log(`${toks[1].note}=${toks[1].pos}`);
