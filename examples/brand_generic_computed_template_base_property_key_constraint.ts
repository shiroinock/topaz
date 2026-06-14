/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type Brand<T extends PropertyKey, K extends string> = T & { readonly [UserIdBrand]: K };
type UserId = Brand<string, "UserId">;
type Score = Brand<number, "Score">;

function revealUser(id: UserId): string {
  return id;
}

function revealScore(score: Score): number {
  return score;
}

function sameUser(id: UserId): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const score: Score = 42 as Score;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealScore(score));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
