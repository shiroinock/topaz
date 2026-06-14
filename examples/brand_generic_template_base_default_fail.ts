type Brand<T = Array<string>, K = "UserId"> = T & { readonly __brand: K };
type UserId = Brand;

const userId: UserId = ["u1"] as UserId;
console.log(userId);
