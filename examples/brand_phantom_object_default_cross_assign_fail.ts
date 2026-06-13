type Phantom<K = "UserId"> = { readonly __brand: K };
type UserId = string & Phantom;
type TeamId = string & Phantom<"TeamId">;

const userId: UserId = "u1" as UserId;
const teamId: TeamId = userId;

console.log(teamId);
