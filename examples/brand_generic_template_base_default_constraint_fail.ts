type Brand<T extends string = number, K = "UserId"> = T & { readonly __brand: K };
type UserId = Brand;

const userId: UserId = "u1" as UserId;
console.log(userId);
