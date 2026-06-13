/// <reference path="./brand_unique_symbol_ambient.d.ts" />

type UserId = string & { readonly [UserIdBrand]: "UserId" };
type TeamId = string & { readonly [TeamIdBrand]: "TeamId" };

const teamId: TeamId = "t1" as TeamId;
const userId: UserId = teamId;
console.log(userId);

