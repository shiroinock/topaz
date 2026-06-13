interface UserIdBrand {
  readonly __brand: "Id";
}

interface OrderIdBrand {
  readonly __brand: "Id";
}

type UserId = string & UserIdBrand;
type OrderId = string & OrderIdBrand;

const userId: UserId = "u1" as UserId;
const orderId: OrderId = userId;

console.log(orderId);
