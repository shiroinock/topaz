type UnknownId = string & { readonly __brand: unknown };
type NeverId = string & { readonly __brand: never };

function revealUnknown(id: UnknownId): string {
  return id;
}

function revealNever(id: NeverId): string {
  return id;
}

function sameUnknown(id: UnknownId): UnknownId {
  return id;
}

function sameNever(id: NeverId): NeverId {
  return id;
}

const unknownId: UnknownId = "u1" as UnknownId;
const neverId: NeverId = "n1" as NeverId;
const rawUnknown: string = unknownId;
const rawNever: string = neverId;
const ids: Array<UnknownId> = [unknownId, sameUnknown(unknownId)];

console.log(revealUnknown(unknownId));
console.log(rawUnknown);
console.log(revealNever(neverId));
console.log(unknownId === sameUnknown(unknownId));
console.log(rawNever === revealNever(neverId));
console.log(ids[1]);
console.log(sameNever(neverId));
