type Phantom<K = "UserId"> = { readonly __brand: K };
type Opaque<K = unknown> = { readonly __opaque: K };
type Tagged<K = never> = { readonly __tag: K };

type UserId = string & Phantom;
type UserIdExplicit = string & Phantom<"UserId">;
type TeamId = string & Phantom<"TeamId">;
type UnknownId = string & Opaque;
type NeverId = string & Tagged;

function revealUser(id: UserId): string {
  return id;
}

function sameUser(id: UserId): UserIdExplicit {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

function revealUnknown(id: UnknownId): string {
  return id;
}

function revealNever(id: NeverId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const explicit: UserIdExplicit = userId;
const defaulted: UserId = explicit;
const teamId: TeamId = "t1" as TeamId;
const unknownId: UnknownId = "x1" as UnknownId;
const neverId: NeverId = "n1" as NeverId;
const rawUser: string = defaulted;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(sameUser(userId));
console.log(userId === explicit);
console.log(rawUser === revealUser(explicit));
console.log(ids[1]);
console.log(revealTeam(teamId));
console.log(revealUnknown(unknownId));
console.log(revealNever(neverId));
