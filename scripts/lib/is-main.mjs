import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// True when the module at metaUrl is the script Node was started with.
export function isMain(metaUrl, argvPath = process.argv[1]) {
  return Boolean(argvPath) && path.resolve(argvPath) === fileURLToPath(metaUrl);
}
