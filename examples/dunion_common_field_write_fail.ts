// Phase 1.5-6 prep #16: reading a common field off an unnarrowed dunion is
// allowed, but writing one is rejected — a write would have to pick a variant
// (the field sits at a different offset in each), so narrowing is required.

type Tok =
  | { kind: "num"; pos: number; value: number }
  | { kind: "eof"; pos: number };

const t: Tok = { kind: "eof", pos: 5 };
t.pos = 9;
console.log(`${t.pos}`);
