/**
 * Backend Performance Profiler - SupportHub Phase 1 Benchmark Instrumentation
 * Collects timing data for Express routes, controllers, SQL queries.
 */

const IS_DEV = process.env.NODE_ENV !== 'production'
const IS_AUDIT = process.env.PERF_AUDIT === 'true'

// --- Timing Buffer ---

export interface TimingEntry {
  label: string
  durationMs: number
  category: 'controller' | 'sql_query' | 'api_route' | 'middleware' | 'auth'
  timestamp: number
  metadata?: Record<string, unknown>
}

let timingBuffer: TimingEntry[] = []

export function resetBuffer() {
  timingBuffer = []
}

export function recordTiming(entry: TimingEntry) {
  timingBuffer.push(entry)
  if ((IS_DEV || IS_AUDIT) && entry.durationMs > 50) {
    console.log(`[BACKEND] [${entry.category}] ${entry.label} ${Math.round(entry.durationMs)}ms`)
  }
}

export function getTimingBuffer(): TimingEntry[] {
  return [...timingBuffer]
}

// --- Controller Wrapper ---

type AsyncFn<T = unknown> = (...args: any[]) => Promise<T>

export function wrapController<T>(fnName: string, fn: AsyncFn<T>): AsyncFn<T> {
  const wrapped = async (...args: any[]): Promise<T> => {
    const start = performance.now()
    try {
      const result = await fn(...args)
      recordTiming({
        label: fnName,
        durationMs: performance.now() - start,
        category: 'controller',
        timestamp: Date.now(),
      })
      return result
    } catch (error) {
      recordTiming({
        label: `${fnName} (FAILED)`,
        durationMs: performance.now() - start,
        category: 'controller',
        timestamp: Date.now(),
        metadata: { error: String(error) },
      })
      throw error
    }
  }
  return wrapped
}

// --- Express Route Timing Middleware ---

import { Request, Response, NextFunction } from 'express'

export function routeTimingMiddleware(label: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now()
    const originalEnd = res.end.bind(res)

    res.end = function (this: Response, ...args: any[]) {
      const duration = performance.now() - start
      recordTiming({
        label: `${label} [${req.method}]`,
        durationMs: duration,
        category: 'api_route',
        timestamp: Date.now(),
        metadata: { path: req.path, method: req.method, status: res.statusCode },
      })
      return originalEnd(...args)
    } as typeof res.end

    next()
  }
}

// --- Auth Timing Middleware ---

export function authTimingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now()
  const originalEnd = res.end.bind(res)

  res.end = function (this: Response, ...args: any[]) {
    recordTiming({
      label: 'Auth Check',
      durationMs: performance.now() - start,
      category: 'auth',
      timestamp: Date.now(),
    })
    return originalEnd(...args)
  } as typeof res.end

  next()
}

// --- SQL Query Timing ---

export interface SqlTimingEntry {
  queryLabel: string
  durationMs: number
  truncatedSql: string
}

let sqlQueryBuffer: SqlTimingEntry[] = []
let sqlQueryCounter = 0

export function resetSqlBuffer() {
  sqlQueryBuffer = []
  sqlQueryCounter = 0
}

export function recordSqlTiming(durationMs: number, sql: string): number {
  sqlQueryCounter++
  const truncated = sql.replace(/\s+/g, ' ').substring(0, 100)
  sqlQueryBuffer.push({
    queryLabel: `[SQL #${sqlQueryCounter}]`,
    durationMs,
    truncatedSql: truncated,
  })
  recordTiming({
    label: `SQL #${sqlQueryCounter}`,
    durationMs,
    category: 'sql_query',
    timestamp: Date.now(),
    metadata: { sql: truncated },
  })
  return sqlQueryCounter
}

export function getSqlQueryBuffer(): SqlTimingEntry[] {
  return [...sqlQueryBuffer]
}

// --- Report ---

export interface BenchmarkReport {
  generatedAt: string
  summary: {
    totalControllers: number
    totalSqlQueries: number
    totalDurationMs: number
  }
  slowestControllers: TimingEntry[]
  slowestSqlQueries: TimingEntry[]
  fullTimeline: TimingEntry[]
}

export function generateReport(): BenchmarkReport {
  const entries = getTimingBuffer()
  const sqlEntries = getSqlQueryBuffer()
  const totalDuration = entries.reduce((sum, e) => sum + e.durationMs, 0)

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalControllers: entries.filter(e => e.category === 'controller').length,
      totalSqlQueries: sqlEntries.length,
      totalDurationMs: Math.round(totalDuration),
    },
    slowestControllers: entries
      .filter(e => e.category === 'controller')
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20),
    slowestSqlQueries: entries
      .filter(e => e.category === 'sql_query')
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20),
    fullTimeline: entries,
  }
}

export function printBackendReport() {
  const report = generateReport()
  console.log()
  console.log('='.repeat(80))
  console.log('  BACKEND PERFORMANCE BENCHMARK')
  console.log('='.repeat(80))
  console.log(`  Total Duration: ${report.summary.totalDurationMs}ms`)
  console.log(`  Controller Calls: ${report.summary.totalControllers}`)
  console.log(`  SQL Queries: ${report.summary.totalSqlQueries}`)
  console.log()

  if (report.slowestControllers.length > 0) {
    console.log('SLOWEST CONTROLLERS:')
    report.slowestControllers.forEach((e, i) => {
      console.log(`  #${(i + 1)} ${e.label}: ${Math.round(e.durationMs)}ms`)
    })
    console.log()
  }

  if (report.slowestSqlQueries.length > 0) {
    console.log('SLOWEST SQL QUERIES:')
    report.slowestSqlQueries.forEach((e, i) => {
      console.log(`  #${(i + 1)} ${e.label}: ${Math.round(e.durationMs)}ms`)
    })
    console.log()
  }

  console.log('='.repeat(80))
  console.log()
}

export function resetAll() {
  resetBuffer()
  resetSqlBuffer()
  sqlQueryCounter = 0
}
