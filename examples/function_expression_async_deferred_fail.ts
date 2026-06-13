const f: () => Promise<number> = async function (): Promise<number> {
  return 1;
};

f().then((value: number): void => {
  console.log(value);
});
