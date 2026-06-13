type Brand<T, K extends string | number> = T & { readonly __brand: K };
type UserId = Brand<string, "UserId">;

const id: UserId = "u1" as UserId;
console.log(id);
