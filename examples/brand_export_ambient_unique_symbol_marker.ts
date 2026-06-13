export declare const UserIdBrand: unique symbol;

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };

function revealUser(id: UserId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const rawUser: string = userId;

console.log(revealUser(userId));
console.log(rawUser === revealUser(userId));
