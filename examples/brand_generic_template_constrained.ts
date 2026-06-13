type Brand<T, K extends string> = T & { readonly __brand: K };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

function revealUser(id: UserId): string {
  return id;
}

function revealOrder(id: OrderId): string {
  return id;
}

function sameUser(id: UserId): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const orderId: OrderId = "o1" as OrderId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealOrder(orderId));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
