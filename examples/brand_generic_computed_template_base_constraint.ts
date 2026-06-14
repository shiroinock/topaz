/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type Brand<T extends string, K extends string> = T & { readonly [UserIdBrand]: K };
type UserId = Brand<string, "UserId">;
type TeamId = Brand<string, "TeamId">;

function revealUser(id: UserId): string {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

function sameUser(id: UserId): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealTeam(teamId));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
