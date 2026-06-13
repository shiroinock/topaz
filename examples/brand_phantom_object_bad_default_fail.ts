type Phantom<K = string> = { readonly __brand: K };
type UserId = string & Phantom;

const userId: UserId = "u1" as UserId;
console.log(userId);
