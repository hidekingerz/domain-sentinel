import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
const { hashSync } = bcrypt;

// Read the password from stdin instead of argv so it never lands in shell
// history or /proc/<pid>/cmdline. Input is line-buffered; nothing is echoed
// when stdin is a TTY (we briefly disable terminal echo).
async function readPassword(): Promise<string> {
  const wasRaw = stdin.isTTY ? stdin.isRaw : false;
  if (stdin.isTTY && typeof stdout.write === 'function') {
    stdout.write('Password: ');
  }
  if (stdin.isTTY) stdin.setRawMode?.(true);
  try {
    const rl = createInterface({ input: stdin, terminal: false });
    const iterator = rl[Symbol.asyncIterator]();
    const { value } = await iterator.next();
    rl.close();
    if (stdin.isTTY && typeof stdout.write === 'function') stdout.write('\n');
    return value ?? '';
  } finally {
    if (stdin.isTTY) stdin.setRawMode?.(wasRaw);
  }
}

const password = (await readPassword()).trim();
if (!password) {
  console.error('no password provided');
  process.exit(1);
}
console.log(hashSync(password, 12));
