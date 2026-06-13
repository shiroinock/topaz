type Brand<T, K> = T & { readonly __brand: K };
type UserId = Brand<string, "UserId">;

const id: UserId = "u1";
console.log(id);
