import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('official visa icon top stroke closes into the body on the left and ends before the body on the right', async () => {
  const source = await fs.readFile(
    new URL('./PassportVisaOfficialSiteMark.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /d="M40 42L64 29C69\.8 25\.9 75\.5 30\.5 75\.5 36\.5V41"/,
  );
  assert.match(
    source,
    /x="30"[\s\S]*y="39"[\s\S]*width="54"[\s\S]*height="68"/,
  );
});
