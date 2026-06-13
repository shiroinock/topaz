type Opaque<T, Token = unknown> = T & { readonly __opaque: Token };
type UnknownId = Opaque<string, unknown>;
type NeverId = Opaque<string, never>;

const unknownId: UnknownId = "u1" as UnknownId;
const neverId: NeverId = unknownId;
console.log(neverId);
