declare const UserIdBrand: unique symbol;
declare const TeamIdBrand: unique symbol;

type Phantom<K> = { readonly [UserIdBrand]: K };
type UserId = string & Phantom<typeof UserIdBrand>;
type UserIdExplicit = string & Phantom<typeof UserIdBrand>;
type TeamId = string & Phantom<typeof TeamIdBrand>;

function revealUser(id: UserId): string {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

function sameUser(id: UserIdExplicit): UserId {
  return id;
}

const userId: UserId = "u1" as UserId;
const userIdExplicit: UserIdExplicit = userId;
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userIdExplicit)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealTeam(teamId));
console.log(userId === sameUser(userIdExplicit));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
