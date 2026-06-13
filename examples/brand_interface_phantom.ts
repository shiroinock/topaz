declare const TokenIdBrandToken: unique symbol;

interface UserIdBrand {
  readonly __brand: "UserId";
}

interface OrderIdBrand {
  readonly __brand: "OrderId";
}

interface OpaqueIdBrand {
  readonly __opaque: unknown;
}

interface NeverIdBrand {
  readonly __brand: never;
}

interface TokenIdBrand {
  readonly __brand: typeof TokenIdBrandToken;
}

type UserId = string & UserIdBrand;
type UserIdAgain = string & UserIdBrand;
type OrderId = string & OrderIdBrand;
type OpaqueId = string & OpaqueIdBrand;
type NeverId = string & NeverIdBrand;
type TokenId = string & TokenIdBrand;

function revealUser(id: UserId): string {
  return id;
}

function revealOrder(id: OrderId): string {
  return id;
}

function sameUser(id: UserIdAgain): UserId {
  return id;
}

function revealOpaque(id: OpaqueId): string {
  return id;
}

function revealNever(id: NeverId): string {
  return id;
}

function revealToken(id: TokenId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const userIdAgain: UserIdAgain = userId;
const orderId: OrderId = "o1" as OrderId;
const opaqueId: OpaqueId = "o1" as OpaqueId;
const neverId: NeverId = "n1" as NeverId;
const tokenId: TokenId = "t1" as TokenId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userIdAgain)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealOpaque(opaqueId));
console.log(userId === sameUser(userIdAgain));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
console.log(revealToken(tokenId));
console.log(revealNever(neverId));
console.log(revealOrder(orderId));
