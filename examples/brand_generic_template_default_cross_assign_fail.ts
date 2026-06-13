type Brand<T, K = "UserId"> = T & { readonly __brand: K };
type UserId = Brand<string>;
type TeamId = Brand<string, "TeamId">;

const userId: UserId = "u1" as UserId;
const teamId: TeamId = userId;

console.log(teamId);
