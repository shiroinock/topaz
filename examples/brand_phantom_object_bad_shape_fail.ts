type Phantom<K> = { __brand: K; other: K };
type UserId = string & Phantom<"UserId">;

const userId: UserId = "u1" as UserId;
console.log(userId);
