type UserId = string & { readonly ["brand"]: "UserId" };

const id: UserId = "u1" as UserId;
console.log(id);

