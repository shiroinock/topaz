type Brand<T, K = "UserId"> = T & { readonly __brand: K };
type OtherBrand<T, K = "UserId"> = T & { readonly __brand: K };
type UserId = Brand<string>;
type UserIdExplicit = Brand<string, "UserId">;
type TeamId = Brand<string, "TeamId">;
type OtherUserId = OtherBrand<string>;

function revealUser(id: UserId): string {
  return id;
}

function sameUser(id: UserId): UserIdExplicit {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

function revealOther(id: OtherUserId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const explicit: UserIdExplicit = userId;
const defaulted: UserId = explicit;
const teamId: TeamId = "t1" as TeamId;
const otherId: OtherUserId = "other" as OtherUserId;
const rawUser: string = defaulted;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(sameUser(userId));
console.log(userId === explicit);
console.log(rawUser === revealUser(explicit));
console.log(ids[1]);
console.log(revealTeam(teamId));
console.log(revealOther(otherId));
