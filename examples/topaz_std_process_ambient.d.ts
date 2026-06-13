declare module "std/process" {
  export function writeStdout(s: string): void;
  export function writeStderr(s: string): void;
  export function writeError(s: string): void;
}

declare const process: {
  stdout: {
    write(s: string): void;
  };
  stderr: {
    write(s: string): void;
  };
};
