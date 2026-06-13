declare const UserIdBrand: unique symbol;
declare const TeamIdBrand: unique symbol;

type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };
type TeamId = string & { readonly [TeamIdBrand]: typeof TeamIdBrand };

function revealUser(id: UserId): string {
  return id;
}

function sameUser(id: UserId): UserId {
  return id;
}

function revealTeam(id: TeamId): string {
  return id;
}

const userId: UserId = "u1" as UserId;
const teamId: TeamId = "t1" as TeamId;
const rawUser: string = userId;
const ids: Array<UserId> = [userId, sameUser(userId)];

console.log(revealUser(userId));
console.log(rawUser);
console.log(revealTeam(teamId));
console.log(userId === sameUser(userId));
console.log(rawUser === revealUser(userId));
console.log(ids[1]);
