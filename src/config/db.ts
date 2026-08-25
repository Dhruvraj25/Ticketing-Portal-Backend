import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { performance } from 'perf_hooks'
import * as schema from '../models/schema'
import { recordSqlTiming } from '../lib/performance-profiler'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
console.log('[DB] DATABASE_URL configured:', !!process.env.DATABASE_URL)
console.log(
  '[DB] DATABASE_HOST:',
  process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).hostname
    : 'MISSING'
)
console.log(
  '[DB] DATABASE_NAME:',
  process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname
    : 'MISSING'
)
// ── SQL Query Timing ──────────────────────────────────────────────────────
// Wrap pool.query to measure execution time of every SQL statement.

const IS_DEV_SQL = process.env.NODE_ENV !== 'production' || process.env.PERF_AUDIT === 'true'

let sqlTimeTotal = 0
let sqlQueryCount = 0

export function resetBackendSqlTiming() {
  sqlTimeTotal = 0
  sqlQueryCount = 0
}

export function getBackendSqlTiming() {
  return { totalMs: sqlTimeTotal, count: sqlQueryCount }
}

const originalPoolQuery = pool.query.bind(pool) as unknown as (
  queryTextOrConfig: string | { text: string; values?: unknown[] },
  values?: unknown[] | ((err: Error | null, result: unknown) => void),
  callback?: (err: Error | null, result: unknown) => void,
) => Promise<unknown> | void

pool.query = function (
  this: typeof pool,
  queryTextOrConfig: string | { text: string; values?: unknown[] },
  values?: unknown[] | ((err: Error | null, result: unknown) => void),
  callback?: (err: Error | null, result: unknown) => void,
): Promise<unknown> | void {
  const start = IS_DEV_SQL ? performance.now() : 0

  const queryText =
    typeof queryTextOrConfig === 'string'
      ? queryTextOrConfig
      : queryTextOrConfig?.text || ''

  const result = originalPoolQuery(queryTextOrConfig, values as any, callback as any)

  if (result && typeof (result as Promise<unknown>).then === 'function') {
    return (result as Promise<unknown>).finally(() => {
      if (IS_DEV_SQL) {
        const duration = performance.now() - start
        sqlTimeTotal += duration
        sqlQueryCount++

        // Record to profiler buffer
        recordSqlTiming(duration, queryText)

        const truncated = queryText.replace(/\s+/g, ' ').substring(0, 100)
        const flag = duration > 500 ? '!' : duration > 200 ? '+' : duration > 100 ? '~' : ' '
        console.log(`  ${flag}  [BACKEND SQL #${sqlQueryCount}] ${String(Math.round(duration)).padStart(6)}ms  ${truncated}`)
      }
    })
  }

  return result
} as typeof pool.query

export const db = drizzle(pool, { schema })
