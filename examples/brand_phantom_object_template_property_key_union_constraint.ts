type Phantom<K extends number | symbol | string> = { readonly __brand: K };
type UserId = string & Phantom<"UserId">;
type UserIdAgain = string & Phantom<"UserId">;
type OrderId = string & Phantom<"OrderId">;

function revealUser(id: UserId): string {
  return id;
}

function revealOrder(id: OrderId): string {
  return id;
}

function sameUser(id: UserIdAgain): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const userIdAgain: UserIdAgain = userId;
const orderId: OrderId = "o1" as OrderId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userIdAgain)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealOrder(orderId));
console.log(userId === sameUser(userIdAgain));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
