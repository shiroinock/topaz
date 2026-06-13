type Brand<T extends string | number | symbol, K extends string> = T & { readonly __brand: K };
type UserId = Brand<string, "UserId">;

const id: UserId = "u1" as UserId;
console.log(id);
