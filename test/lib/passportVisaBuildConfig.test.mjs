import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('next config does not need externalDir after passport-visa package migration into src', async () => {
  const source = await fs.readFile(
    new URL('../../next.config.mjs', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /externalDir\s*:\s*true/);
});
