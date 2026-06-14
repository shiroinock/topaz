type Brand<T, K> = T & { __brand: K; other: K };
type UserId = Brand<string, "UserId">;

const id: UserId = "u1" as UserId;
console.log(id);
