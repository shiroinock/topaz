/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type Brand<T, K> = T & { readonly [UserIdBrand]: K };
type UserId = Brand<string, typeof UserIdBrand>;
type TeamId = Brand<string, typeof TeamIdBrand>;

const teamId: TeamId = "t1" as TeamId;
const userId: UserId = teamId;
console.log(userId);
