declare let UserIdBrand: unique symbol;

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };

const userId: UserId = "u1" as UserId;
console.log(userId);
