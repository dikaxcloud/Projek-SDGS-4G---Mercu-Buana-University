import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRecordRule, RULE_STATUS } from '../src/services/ai/ruleEngine.js'

test('health rule engine classifies normal measurements', () => {
  assert.equal(evaluateRecordRule({ systolic: 120, diastolic: 80, sugar: 105, temperature: 36.8 }).status, RULE_STATUS.NORMAL)
  assert.equal(evaluateRecordRule({ systolic: 110, diastolic: 70, sugar: 105, temperature: 36.8 }).status, RULE_STATUS.NORMAL)
})

test('health rule engine raises attention for high measurements', () => {
  assert.equal(evaluateRecordRule({ temperature: 38.5 }).status, RULE_STATUS.PERLU_KONSULTASI)
  assert.equal(evaluateRecordRule({ systolic: 150, diastolic: 95 }).status, RULE_STATUS.PERLU_KONSULTASI)
  assert.equal(evaluateRecordRule({ sugar: 220, sugarContext: 'sewaktu' }).status, RULE_STATUS.PERLU_KONSULTASI)
})
