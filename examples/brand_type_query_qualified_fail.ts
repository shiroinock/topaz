/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type UserId = string & { readonly [UserIdBrand]: typeof SomeNamespace.UserIdBrand };

const userId: UserId = "u1" as UserId;
console.log(userId);
