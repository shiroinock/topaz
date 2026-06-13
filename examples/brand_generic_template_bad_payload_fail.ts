type Brand<T, K> = T & { readonly __brand: K };
type UserId = Brand<string, string>;

const id: UserId = "u1" as UserId;
console.log(id);
