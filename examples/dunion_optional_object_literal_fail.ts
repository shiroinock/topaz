// Phase 1.5-6 prep #16 (negative): after stripping `undefined` from a
// `dunion | undefined` target, the inner dunion's discriminator validation
// must still fire. An object literal whose `kind` matches no variant is
// rejected just as it would be for a bare dunion target.

type IdentBind = { kind: "ident"; name: string };
type PairBind = { kind: "pair"; first: string; second: string };
type Bind = IdentBind | PairBind;

let binding: Bind | undefined = undefined;
binding = { kind: "bogus", name: "x" };
console.log("unreachable");
