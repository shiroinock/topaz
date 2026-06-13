type Brand<T, K> = T & { readonly __brand: K };
type Payload = { readonly tag: string };
type UserId = Brand<string, Payload>;

const id: UserId = "u1" as UserId;
console.log(id);
