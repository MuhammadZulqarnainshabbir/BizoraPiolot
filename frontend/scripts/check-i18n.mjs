// Verifies the Urdu translation is complete. Run: npm run i18n:check
//
// 1. Collects every translatable English string:
//    - templates: 'text' | t
//    - TypeScript: tk('text'), msg('text', ...), errorMessage(error, 'text'), i18n.t('text')
//    - backend: API error messages and the product category list
// 2. Fails if any string has no Urdu entry, or if placeholders like {count} differ.
// 3. Fails if a template contains visible text that isn't passed through the `t` pipe.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const backendSrc = join(frontend, '..', 'backend', 'src');
const appSrc = join(frontend, 'src', 'app');

const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const str = "'((?:[^'\\\\]|\\\\.)+)'";
const unescape = s => s.replace(/\\(.)/g, '$1');
const keys = new Map(); // key -> first location
const add = (key, where) => { if (!keys.has(key)) keys.set(key, where); };
const problems = [];

// Visible literals allowed to stay untranslated (brand and format examples).
const ALLOWED_LITERALS = new Set(['Bizora', 'Pilot', 'Bizora Pilot', 'SAM001', 'EMP-0001', 'owner@example.com', '+49 123 456789']);

// The platform console (Bizora staff) is English-only by design.
const isPlatformFile = f => /[\\/]platform-admin[\\/]|[\\/]services[\\/]platform[\\/]|platformAdmin|platformAuth|platformPermissions|requestMetrics|entitlements\.js$|Platform(Admin|AuditLog|Setting)\.js$|SubscriptionPlan\.js$|ShopSubscription\.js$|FeatureOverride\.js$|config[\\/]features\.js$/.test(f) && !f.endsWith('shopStatus.js');
// Spec files hold test fixtures (server messages, product names), not interface text.
for (const file of walk(appSrc).filter(f => f.endsWith('.ts') && !f.endsWith('ur.ts') && !f.endsWith('.spec.ts') && !isPlatformFile(f))) {
  const source = readFileSync(file, 'utf8');
  const where = relative(frontend, file);
  for (const re of [
    new RegExp(`${str}\\s*\\|\\s*t\\b`, 'g'),
    new RegExp(`\\btk\\(\\s*${str}`, 'g'),
    new RegExp(`\\bmsg\\(\\s*${str}`, 'g'),
    new RegExp(`\\berrorMessage\\([^,]+,\\s*${str}`, 'g'),
    new RegExp(`\\bi18n\\.t\\(\\s*${str}`, 'g')
  ]) for (const m of source.matchAll(re)) add(unescape(m[1]), where);

  // Untranslated visible text in templates.
  for (const tpl of source.matchAll(/template:\s*`([\s\S]*?)`/g)) {
    const html = tpl[1].replace(/\{\{[\s\S]*?\}\}/g, ' ');
    // Blank out attribute values first so a '>' inside an expression isn't read as text.
    const textOnly = html.replace(/"[^"]*"/g, '""');
    for (const m of textOnly.matchAll(/>([^<>]+)</g)) {
      const text = m[1].trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
      if (/[A-Za-z]{2,}/.test(text) && !ALLOWED_LITERALS.has(text)) problems.push(`${where}: untranslated template text "${text}"`);
    }
    for (const m of html.matchAll(/\s(placeholder|aria-label|title|alt)="([^"]*)"/g)) {
      if (/[A-Za-z]{2,}/.test(m[2]) && !ALLOWED_LITERALS.has(m[2])) problems.push(`${where}: untranslated ${m[1]}="${m[2]}" (bind it: [${m[1]}]="'…' | t")`);
    }
  }
}

// Backend messages shown to users (static ones; dynamic ones are matched by patterns in i18n.service.ts).
for (const file of walk(backendSrc).filter(f => f.endsWith('.js'))) {
  const source = readFileSync(file, 'utf8');
  const where = relative(join(frontend, '..'), file);
  // PDF receipts are printed in English on purpose (legal documents); their text isn't shown in the browser.
  if (file.endsWith('receiptService.js') || isPlatformFile(file)) continue;
  if (file.endsWith('productCategories.js')) {
    const list = source.slice(source.indexOf('PRODUCT_CATEGORIES'), source.indexOf('].map('));
    for (const m of list.matchAll(new RegExp(str, 'g'))) add(unescape(m[1]), where);
    continue;
  }
  for (const re of [
    new RegExp(`message:\\s*${str}`, 'g'),
    new RegExp(`error:\\s*${str}`, 'g'),
    new RegExp(`validationError\\(res,\\s*${str}`, 'g'),
    new RegExp(`_MESSAGE\\s*=\\s*${str}`, 'g'),
    new RegExp(`INVALID_LOGIN\\s*=\\s*${str}`, 'g'),
    new RegExp(`\\?\\s*${str}\\s*:\\s*${str}`, 'g'),
    new RegExp(`return\\s+${str};`, 'g'),
    new RegExp(`new Error\\(${str}\\)`, 'g'),
    // utils/http.js error helpers
    new RegExp(`\\b(?:badRequest|notFound|conflict|forbidden)\\(\\s*${str}`, 'g'),
    // Field labels, shown inside "{field} is required" etc. (see SERVER_PATTERNS in i18n.service.ts)
    new RegExp(`\\b(?:money|text|oneOf|wholeNumber)\\([^;]*?,\\s*${str}`, 'g')
  ]) for (const m of source.matchAll(re)) {
    // Messages are sentences or capitalised; skips internal values like 'paid' / 'open' and codes like 'SALE_CANCELLED'.
    for (const group of m.slice(1)) {
      if (group && (/^[A-Z]/.test(group) || group.includes(' ')) && !/^[A-Z_]+$/.test(group)) add(unescape(group), where);
    }
  }
}
// Pieces of a message built at runtime, not messages themselves.
['zero or more', 'more than zero'].forEach(k => keys.delete(k));
// Startup-only error; it never reaches the browser.
keys.delete('JWT_SECRET must contain at least 32 characters');
// Built in server.js from expressions the patterns above can't see.
['Malformed JSON body', 'Unexpected server error'].forEach(k => add(k, 'backend/src/server.js'));

// Translations.
const urSource = readFileSync(join(appSrc, 'core', 'i18n', 'ur.ts'), 'utf8');
const ur = new Map();
for (const m of urSource.matchAll(new RegExp(`^\\s*${str}\\s*:\\s*${str},?\\s*$`, 'gm'))) {
  const key = unescape(m[1]);
  if (ur.has(key)) problems.push(`ur.ts: duplicate key "${key}"`);
  ur.set(key, unescape(m[2]));
}

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const [key, where] of keys) {
  if (!ur.has(key)) problems.push(`missing Urdu for "${key}"  (${where})`);
  else if (placeholders(key) !== placeholders(ur.get(key))) problems.push(`placeholder mismatch for "${key}": "${ur.get(key)}"`);
}
const unused = [...ur.keys()].filter(k => !keys.has(k));

console.log(`${keys.size} translatable strings, ${ur.size} Urdu entries.`);
if (unused.length) console.log(`Note: ${unused.length} Urdu entries are not used anywhere:\n  ${unused.join('\n  ')}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Urdu translation is complete.');
