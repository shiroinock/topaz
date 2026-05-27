// Phase 1.5-6 prep #11: the discriminator property must be a plain string
// literal so we can select the variant statically. Identifier-valued kind
// (even if it resolves to a string at runtime) is rejected.

type IdentToken = { kind: "ident"; text: string };
type NumberToken = { kind: "number"; value: number };
type Token = IdentToken | NumberToken;

function getKind(): string {
  return "ident";
}

const xs: Array<Token> = [];
xs.push({ kind: getKind(), text: "x" });
console.log(xs.length);
