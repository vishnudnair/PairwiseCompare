import type { RankingRow, Vote, UserRole } from '../models/domain'

export type AuditEvent = {
  id: string
  type: 'session-created' | 'vote-submitted' | 'ranking-recalculated' | 'sync-completed'
  userId: string
  timestamp: string
  sessionId: string
  details: Record<string, string | number>
}

export interface AuditStore {
  append(event: AuditEvent): Promise<void>
  list(sessionId: string): Promise<AuditEvent[]>
}

export class ExtensionAuditStore implements AuditStore {
  private readonly key = 'pairwise-audit'
  async append(event: AuditEvent): Promise<void> {
    const events = await this.list(event.sessionId)
    localStorage.setItem(this.key, JSON.stringify([...events, event]))
  }
  async list(sessionId: string): Promise<AuditEvent[]> {
    const raw = localStorage.getItem(this.key)
    if (!raw) return []
    try {
      const events = JSON.parse(raw) as AuditEvent[]
      return events.filter((event) => event.sessionId === sessionId)
    } catch {
      return []
    }
  }
}

export interface PermissionsService {
  roleFor(userId: string, administrators: readonly string[], facilitators: readonly string[], stakeholders: readonly string[]): UserRole
  canVote(role: UserRole): boolean
  canFacilitate(role: UserRole): boolean
  canSynchronize(role: UserRole): boolean
}

export class AzureDevOpsPermissionsService implements PermissionsService {
  roleFor(userId: string, administrators: readonly string[], facilitators: readonly string[], stakeholders: readonly string[]): UserRole {
    if (administrators.includes(userId)) return 'Administrator'
    if (facilitators.includes(userId)) return 'Facilitator'
    if (stakeholders.includes(userId)) return 'Stakeholder'
    return 'Viewer'
  }
  canVote(role: UserRole): boolean { return role === 'Administrator' || role === 'Facilitator' || role === 'Stakeholder' }
  canFacilitate(role: UserRole): boolean { return role === 'Administrator' || role === 'Facilitator' }
  canSynchronize(role: UserRole): boolean { return role === 'Administrator' }
}

export function toCsv(rows: readonly RankingRow[], titles: ReadonlyMap<number, string>): string {
  const header = 'Rank,Work Item ID,Title,Score,Votes'
  const lines = rows.map((row) => [row.rank, row.workItemId, titles.get(row.workItemId) ?? '', row.score, row.votes].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
  return [header, ...lines].join('\n')
}

export function downloadCsv(rows: readonly RankingRow[], titles: ReadonlyMap<number, string>): void {
  const blob = new Blob([toCsv(rows, titles)], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'pairwise-ranking.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

export function voteToAuditDetails(vote: Vote): Record<string, string | number> {
  return { itemAId: vote.itemAId, itemBId: vote.itemBId, selection: vote.selection }
}
