import test from 'node:test'
import assert from 'node:assert/strict'
import { identityLast4, identityNumberError, maskIdentityNumber, normalizeIdentityNumber } from '../src/utils/identity.js'

test('identity input keeps digits only and limits to 16 characters', () => {
  assert.equal(normalizeIdentityNumber('32 0101-0101.0001'), '32010101010001')
  assert.equal(normalizeIdentityNumber('abc'), '')
  assert.equal(normalizeIdentityNumber('12345678901234567890'), '1234567890123456')
})

test('identity validation requires exactly 16 digits', () => {
  assert.match(identityNumberError(''), /wajib diisi/)
  assert.match(identityNumberError('123456789012345'), /tepat 16 digit/)
  assert.match(identityNumberError('12345678901234567'), /tepat 16 digit/)
  assert.equal(identityNumberError('1234567890123456'), '')
  assert.equal(identityNumberError(' 3201 0101 0101 0001 '), '')
})

test('identity display helpers mask the first 12 digits', () => {
  assert.equal(maskIdentityNumber('0001'), '********0001')
  assert.equal(maskIdentityNumber(''), 'Belum tersedia')
  assert.equal(identityLast4('3201010101010001'), '0001')
  assert.equal(identityLast4('123'), '')
})
