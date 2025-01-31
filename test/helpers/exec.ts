import { exec as nodeExec } from 'child_process';

export async function exec(command: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(resolve => {
    nodeExec(command).on('close', code => resolve({ code, stdout: '', stderr: '' }));
  });
}
