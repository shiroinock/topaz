type Brand<T, K> = T & { readonly __brand: K };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

const orderId: OrderId = "o1" as OrderId;
const userId: UserId = orderId;
console.log(userId);
