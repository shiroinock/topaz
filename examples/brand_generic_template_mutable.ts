type Brand<T, K> = T & { __brand: K };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
type Score = Brand<number, "Score">;

function revealUser(id: UserId): string {
  return id;
}

function revealOrder(id: OrderId): string {
  return id;
}

function sameUser(id: UserId): UserId {
  return id;
}

function revealScore(score: Score): number {
  return score;
}

const userId: UserId = "u1" as UserId;
const orderId: OrderId = "o1" as OrderId;
const score: Score = 42 as Score;
const rawUser: string = userId;
const rawScore: number = score;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealOrder(orderId));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
console.log(rawScore);
console.log(revealScore(score));
