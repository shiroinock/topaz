interface UserIdBrand {
  brand(): "UserId";
}

type UserId = string & UserIdBrand;

const userId: UserId = "u1" as UserId;
console.log(userId);
