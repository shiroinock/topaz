/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type Brand<T = string, K = typeof UserIdBrand> = T & { readonly [UserIdBrand]: K };
type UserId = Brand;
type Score = Brand<number>;
type TeamId = Brand<string, typeof TeamIdBrand>;

function revealUser(id: UserId): string {
  return id;
}

function revealScore(id: Score): number {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

function sameUser(id: UserId): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const score: Score = 42 as Score;
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealScore(score));
console.log(revealTeam(teamId));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
