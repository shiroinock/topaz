/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };
type TeamId = string & { readonly [TeamIdBrand]: typeof TeamIdBrand };

const teamId: TeamId = "t1" as TeamId;
const userId: UserId = teamId;
console.log(userId);
