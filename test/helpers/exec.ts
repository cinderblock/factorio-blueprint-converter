import { exec as nodeExec } from 'node:child_process';

export function exec(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    nodeExec(command, (exception, stdout, stderr) => {
      if (exception) {
        reject(exception);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
