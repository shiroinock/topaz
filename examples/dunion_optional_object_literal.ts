// Phase 1.5-6 prep #16: object literal whose contextual target is
// `dunion | undefined`. This mirrors the self-hosted parser's
// `let binding: ForOfBinding | undefined = undefined; binding = { kind: ... }`
// pattern (topaz_parser.ts:709). The literal is emitted against the dunion
// inner type (discriminator-driven variant selection) and then widened to the
// `T | undefined` slot — a no-op on the fat-struct C representation. Reading
// variant fields still requires narrowing the `undefined` away first.

type IdentBind = { kind: "ident"; name: string };
type PairBind = { kind: "pair"; first: string; second: string };
type Bind = IdentBind | PairBind;

function classify(useIdent: boolean): Bind | undefined {
  let binding: Bind | undefined = undefined;
  if (useIdent) {
    binding = { kind: "ident", name: "x" };
  } else {
    binding = { kind: "pair", first: "a", second: "b" };
  }
  return binding;
}

function show(b: Bind | undefined): string {
  if (b === undefined) {
    return "none";
  }
  switch (b.kind) {
    case "ident":
      return `ident ${b.name}`;
    case "pair":
      return `pair ${b.first},${b.second}`;
  }
  return "?";
}

console.log(show(classify(true)));
console.log(show(classify(false)));

// `undefined` still flows in unchanged through the same slot.
let empty: Bind | undefined = undefined;
console.log(show(empty));
