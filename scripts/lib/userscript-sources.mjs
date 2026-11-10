import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function isUserscriptFile(file) {
  return /\.(entry\.ts|user\.js)$/.test(file);
}

// Lists the userscript install surface under src/ and dist/.
export async function worktreeSource(root) {
  async function walk(relative) {
    let entries;
    try {
      entries = await readdir(path.join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const files = [];
    for (const entry of entries) {
      const file = `${relative}/${entry.name}`;
      if (isUserscriptFile(file)) files.push(file);
      else if (entry.isDirectory()) files.push(...(await walk(file)));
    }
    return files;
  }
  return {
    files: (await Promise.all(['src', 'dist'].map(walk))).flat().sort(),
    readText: (file) => readFile(path.join(root, file), 'utf8'),
  };
}

export function refSource(root, ref) {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let output;
  try {
    output = git(['ls-tree', '-rz', '--name-only', ref, '--', 'src', 'dist']);
  } catch {
    throw new Error(`cannot read version baseline or target ref ${ref}`);
  }
  return {
    files: output.split('\0').filter(isUserscriptFile).sort(),
    readText(file) {
      // Preserve bytes, including trailing newlines, just like the worktree reader.
      try {
        return git(['show', `${ref}:${file}`]);
      } catch {
        throw new Error(`cannot read ${file} from ${ref}`);
      }
    },
  };
}
