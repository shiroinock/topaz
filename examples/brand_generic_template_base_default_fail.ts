type Brand<T = string, K = "UserId"> = T & { readonly __brand: K };
type UserId = Brand<string>;

const userId: UserId = "u1" as UserId;
console.log(userId);
