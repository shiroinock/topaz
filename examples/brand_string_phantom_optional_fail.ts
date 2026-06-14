type UserId = string & { __brand?: "UserId" };

const id: UserId = "u1" as UserId;
console.log(id);
