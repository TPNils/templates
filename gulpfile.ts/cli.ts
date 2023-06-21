
import { ExecException, exec } from 'child_process';

export interface ExecResponse {
  cmd: string;
  stdout?: string;
  stderr?: string;
  err?: ExecException;
};

export class Cli {

  public execPromise(command: string): Promise<ExecResponse> {
    return new Promise<ExecResponse>((resolve, reject) => {
      exec(command, (err, stdout, stderr) => {
        resolve({
          cmd: command,
          err: err as ExecException,
          stdout,
          stderr
        });
      });
    });
  }

  public throwError(cmd: ExecResponse, options: {ignoreOut?: boolean} = {}): void {
    if (cmd.err) {
      throw cmd.err;
    }
    if (cmd.stderr && !options.ignoreOut) {
      throw new Error(cmd.stderr);
    }
  }

}

export const cli = new Cli();
for (let prop in cli) {
  if (typeof cli[prop] === 'function') {
    cli[prop] = cli[prop].bind(cli);
  }
}