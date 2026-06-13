/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };

const userId: UserId = "u1";
console.log(userId);
