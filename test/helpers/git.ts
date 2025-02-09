import { exec } from './exec.js';

export async function getGitHash() {
  const hash = await exec('git rev-parse HEAD');
  return hash.stdout.trim() + ((await isGitDirty()) ? '-dirty' : '');
}

export async function isGitDirty() {
  const status = await exec('git status --porcelain --exclude=test/samples');
  return status.stdout.trim().length > 0;
}
