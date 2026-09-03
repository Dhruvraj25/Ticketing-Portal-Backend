import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getActualVsEstimatedReport } from '../src/controllers/reports/actual-vs-estimated.reports'
import { checkAccess } from '../src/controllers/reports/utils'

test('report: clients are denied the actual-vs-estimated report', async () => {
  await assert.rejects(
    getActualVsEstimatedReport({ reportType: 'actual_vs_estimated' }, { id: 'c1', role: 'client' }),
    /Access denied/,
  )
})

test('report: access control allows managers, developers, admins', () => {
  assert.equal(checkAccess('project_manager', 'actual_vs_estimated'), true)
  assert.equal(checkAccess('developer', 'actual_vs_estimated'), true)
  assert.equal(checkAccess('admin', 'actual_vs_estimated'), true)
  assert.equal(checkAccess('client', 'actual_vs_estimated'), false)
})