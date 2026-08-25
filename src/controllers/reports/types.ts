import type { ReportType } from '../../types/report-types'
import type { TicketStatus, TicketPriority } from '../../types/index'

export interface ReportFilters {
  reportType: ReportType
  dateFrom?: string
  dateTo?: string
  projectId?: number
  moduleId?: number
  developerId?: string
  clientId?: string
  status?: TicketStatus
  priority?: TicketPriority
}

export interface ReportMeta {
  totalRecords: number
  generatedAt: string
  appliedFilters: string[]
  summary: Record<string, string | number>
}

export interface ReportResult {
  meta: ReportMeta
  columns: { key: string; label: string; type?: string }[]
  data: Record<string, unknown>[]
  charts?: {
    type: 'line' | 'bar' | 'pie'
    title: string
    data: { name: string; value: number }[]
  }[]
}
