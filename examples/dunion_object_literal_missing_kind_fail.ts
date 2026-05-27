// Phase 1.5-6 prep #11: object literal targeting a dunion must include the
// discriminator property.

type IdentToken = { kind: "ident"; text: string };
type NumberToken = { kind: "number"; value: number };
type Token = IdentToken | NumberToken;

const xs: Array<Token> = [];
xs.push({ text: "missing_kind_property" });
console.log(xs.length);
