type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

const orderId: OrderId = "o1" as OrderId;
const userId: UserId = orderId;
console.log(userId);
