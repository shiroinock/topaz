declare const UserIdBrand: unique symbol;
declare const TeamIdBrand: unique symbol;

type Brand<T, K = typeof UserIdBrand> = T & { readonly [UserIdBrand]: K };
type UserId = Brand<string>;
type UserIdExplicit = Brand<string, typeof UserIdBrand>;
type TeamId = Brand<string, typeof TeamIdBrand>;

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
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = explicit;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealTeam(teamId));
console.log(userId === explicit);
console.log(rawUser === revealUser(explicit));
console.log(ids[1]);
