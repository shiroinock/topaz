/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type UserId = string & { readonly [UserIdBrand]: "UserId" };

const id: UserId = "u1";
console.log(id);

