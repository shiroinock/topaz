type Phantom<K> = { readonly __brand: K };
type UserId = string & Phantom<"UserId">;
type OrderId = string & Phantom<"OrderId">;

const userId: UserId = "u1" as UserId;
const orderId: OrderId = userId;
console.log(orderId);
