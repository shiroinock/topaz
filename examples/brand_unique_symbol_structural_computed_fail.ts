/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type HasBrandField = { readonly [UserIdBrand]: string };

function show(value: HasBrandField): string {
  return "brand";
}

console.log(show);

