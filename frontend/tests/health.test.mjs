import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBmi, validateExamination } from '../src/utils/health.js'

test('health validation contract remains bounded', () => {
  assert.equal(calculateBmi(68, 170), 23.5)
  assert.equal(validateExamination({ systolic: '120', diastolic: '80' }), '')
  assert.match(validateExamination({ systolic: '400', diastolic: '80' }), /Sistolik/)
  assert.match(validateExamination({ systolic: '120' }), /bersama/)
})
