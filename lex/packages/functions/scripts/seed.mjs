// ported from hive/packages/functions/scripts/seed.mjs (adapted)
// Regenerates the committed emulator seed fixture. Run from lex/:
//   pnpm --filter @lex/functions build
//   firebase emulators:exec --only firestore --project demo-lex \
//     --export-on-exit=packages/functions/emulator-seed \
//     "node packages/functions/scripts/seed.mjs"
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-lex/databases/(default)/documents';

const res = await fetch(`${FIRESTORE}/users/demo-user`, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { displayName: { stringValue: 'Demo User' } } }),
});
if (!res.ok) throw new Error(`seed write failed: ${res.status} ${await res.text()}`);
console.log('seeded users/demo-user');
