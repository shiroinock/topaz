// Same narrowing rule applies to optional fields of object literal types:
// `cfg.port` is `number | undefined` and must be narrowed before use as a
// plain `number`.
type Config = { host: string; port?: number };
function show(cfg: Config): number {
  return cfg.port;
}
console.log(show({ host: "a" }));
