type Opaque<T, Token = unknown> = T & { readonly __opaque: Token };
type UserId = Opaque<string>;
type UserIdExplicit = Opaque<string, unknown>;
type TeamId = Opaque<string, "TeamId">;

function revealUser(id: UserId): string {
  return id;
}

function sameUser(id: UserId): UserIdExplicit {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const explicit: UserIdExplicit = userId;
const defaulted: UserId = explicit;
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = defaulted;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(sameUser(userId));
console.log(userId === explicit);
console.log(rawUser === revealUser(explicit));
console.log(ids[1]);
console.log(revealTeam(teamId));
