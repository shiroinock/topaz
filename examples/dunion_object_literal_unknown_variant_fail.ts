// Phase 1.5-6 prep #11: the discriminator literal must match one of the
// dunion's variant kinds. "punct" is not a variant of Token, so reject.

type IdentToken = { kind: "ident"; text: string };
type NumberToken = { kind: "number"; value: number };
type Token = IdentToken | NumberToken;

const xs: Array<Token> = [];
xs.push({ kind: "punct", text: "+" });
console.log(xs.length);
