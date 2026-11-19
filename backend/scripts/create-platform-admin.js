#!/usr/bin/env node
// Provisions a platform administrator (the first SUPER_ADMIN, or more later).
//
//   PLATFORM_ADMIN_PASSWORD='…' npm run platform-admin:create -- --email you@bizora.pk --name "Your Name" --role SUPER_ADMIN
//
// The password comes from the PLATFORM_ADMIN_PASSWORD environment variable, or is asked for
// interactively (not echoed) when the script runs in a terminal. It is never defaulted, never
// printed, and never written to disk. The admin must change it at first sign-in.
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { connectDB } from '../src/config/db.js';
import { createPlatformAdmin, isStrongPassword, PASSWORD_RULE } from '../src/services/platform/platformAuthService.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter(Boolean));
const email = args.email ?? process.env.PLATFORM_ADMIN_EMAIL;
const name = args.name ?? process.env.PLATFORM_ADMIN_NAME;
const role = (args.role ?? process.env.PLATFORM_ADMIN_ROLE ?? 'SUPER_ADMIN').toUpperCase();

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = () => undefined; // don't echo the password
    rl.question('', (answer) => { rl._writeToOutput = originalWrite; process.stdout.write('\n'); rl.close(); resolve(answer); });
  });
}

try {
  if (!email || !name) throw new Error('Usage: --email <email> --name "<name>" [--role SUPER_ADMIN|SUPPORT_ADMIN|FINANCE_ADMIN]');
  let password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('Set PLATFORM_ADMIN_PASSWORD in the environment (no terminal available to ask for it)');
    password = await askHidden(`Temporary password for ${email} (${PASSWORD_RULE}): `);
  }
  if (!isStrongPassword(password)) throw new Error(PASSWORD_RULE);
  await connectDB();
  const admin = await createPlatformAdmin({ email, name, role, password, mustChangePassword: true });
  console.log(`Created ${admin.role} ${admin.email}. They must change the password at first sign-in at /platform-admin/login.`);
  process.exit(0);
} catch (err) {
  console.error(err.message ?? err);
  process.exit(1);
}
