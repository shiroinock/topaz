type Phantom<K extends string | number> = { readonly __brand: K };
type UserId = string & Phantom<"UserId">;

const id: UserId = "u1" as UserId;
console.log(id);
