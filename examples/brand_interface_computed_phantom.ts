declare const UserIdBrandKey: unique symbol;
declare const TokenBrandKey: unique symbol;
declare const OpaqueBrandKey: unique symbol;
declare const NeverBrandKey: unique symbol;

interface UserIdBrand {
  readonly [UserIdBrandKey]: "UserId";
}

interface TokenIdBrand {
  readonly [TokenBrandKey]: typeof TokenBrandKey;
}

interface OpaqueIdBrand {
  readonly [OpaqueBrandKey]: unknown;
}

interface NeverIdBrand {
  readonly [NeverBrandKey]: never;
}

type UserId = string & UserIdBrand;
type UserIdAgain = string & UserIdBrand;
type TokenId = string & TokenIdBrand;
type OpaqueId = string & OpaqueIdBrand;
type NeverId = string & NeverIdBrand;

function revealUser(id: UserId): string {
  return id;
}

function sameUser(id: UserIdAgain): UserId {
  return id;
}

function revealToken(id: TokenId): string {
  return id;
}

function revealOpaque(id: OpaqueId): string {
  return id;
}

function revealNever(id: NeverId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const userIdAgain: UserIdAgain = userId;
const tokenId: TokenId = "t1" as TokenId;
const opaqueId: OpaqueId = "o1" as OpaqueId;
const neverId: NeverId = "n1" as NeverId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userIdAgain)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealToken(tokenId));
console.log(userId === ids[1]);
console.log(revealOpaque(opaqueId) === "o1");
console.log(revealNever(neverId));
