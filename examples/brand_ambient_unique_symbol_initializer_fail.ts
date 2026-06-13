declare const UserIdBrand: unique symbol = Symbol();

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };

const userId: UserId = "u1" as UserId;
console.log(userId);
