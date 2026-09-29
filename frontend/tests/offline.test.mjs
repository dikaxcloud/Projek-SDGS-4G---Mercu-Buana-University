import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('offline queue uses user partition and idempotency fields', async () => {
  const source = await readFile(resolve(root, 'src/lib/offlineStore.js'), 'utf8')
  assert.match(source, /userId/)
  assert.match(source, /crypto\.randomUUID/)
  assert.match(source, /status: 'pending'/)
  assert.match(source, /markOfflineMutationFailed/)
})
