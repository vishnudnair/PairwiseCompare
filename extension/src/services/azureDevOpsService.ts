import { getClient } from 'azure-devops-extension-api'
import { WorkItemTrackingRestClient, type Wiql } from 'azure-devops-extension-api/WorkItemTracking'
import type { JsonPatchDocument } from 'azure-devops-extension-api/WebApi'
import type { WorkItem, WorkItemType } from '../models/domain'

export type WorkItemQuery = {
  projectId: string
  areaPath?: string
  iterationPath?: string
  types: WorkItemType[]
}

export interface WorkItemService {
  queryWorkItems(query: WorkItemQuery): Promise<WorkItem[]>
  getWorkItemsByIds(project: string, ids: number[]): Promise<WorkItem[]>
  updateRanking(project: string, workItemId: number, score: number, rank: number): Promise<void>
}

const field = (item: { fields?: Record<string, unknown> }, name: string): unknown => item.fields?.[name]

const WORK_ITEM_FIELDS = [
  'System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AreaPath',
  'System.IterationPath', 'Microsoft.VSTS.Common.BusinessValue', 'System.Tags', 'System.AssignedTo', 'System.Description',
]

type RawWorkItem = { id?: number; fields?: Record<string, unknown> }

function toWorkItem(item: RawWorkItem): WorkItem {
  return {
    id: item.id!,
    type: String(field(item, 'System.WorkItemType')) as WorkItemType,
    title: String(field(item, 'System.Title') ?? ''),
    state: String(field(item, 'System.State') ?? ''),
    areaPath: String(field(item, 'System.AreaPath') ?? ''),
    iterationPath: String(field(item, 'System.IterationPath') ?? ''),
    businessValue: typeof field(item, 'Microsoft.VSTS.Common.BusinessValue') === 'number' ? field(item, 'Microsoft.VSTS.Common.BusinessValue') as number : undefined,
    tags: String(field(item, 'System.Tags') ?? '').split(';').map((tag) => tag.trim()).filter(Boolean),
    assignedTo: typeof field(item, 'System.AssignedTo') === 'object' && field(item, 'System.AssignedTo') !== null ? String((field(item, 'System.AssignedTo') as { displayName?: string }).displayName ?? '') : undefined,
    description: String(field(item, 'System.Description') ?? '').replace(/<[^>]*>/g, ''),
  }
}

export class AzureDevOpsWorkItemService implements WorkItemService {
  private readonly client = getClient(WorkItemTrackingRestClient)

  async queryWorkItems(query: WorkItemQuery): Promise<WorkItem[]> {
    const typeClause = query.types.map((type) => `[System.WorkItemType] = '${type.replaceAll("'", "''")}'`).join(' OR ')
    const clauses = [`[System.TeamProject] = '${query.projectId.replaceAll("'", "''")}'`, `(${typeClause})`]
    if (query.areaPath) clauses.push(`[System.AreaPath] UNDER '${query.areaPath.replaceAll("'", "''")}'`)
    if (query.iterationPath) clauses.push(`[System.IterationPath] UNDER '${query.iterationPath.replaceAll("'", "''")}'`)
    const wiql: Wiql = { query: `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')} ORDER BY [System.Id]` }
    const result = await this.client.queryByWiql(wiql, query.projectId)
    const ids = (result.workItems ?? []).map((item) => item.id).filter((id): id is number => id !== undefined)
    return this.getWorkItemsByIds(query.projectId, ids)
  }

  async getWorkItemsByIds(project: string, ids: number[]): Promise<WorkItem[]> {
    if (ids.length === 0) return []
    const response = await this.client.getWorkItems(ids, project, WORK_ITEM_FIELDS)
    return response.map(toWorkItem)
  }

  async updateRanking(project: string, workItemId: number, score: number, rank: number): Promise<void> {
    const operations: JsonPatchDocument = [
      { op: 'add', path: '/fields/Custom.EloPriorityScore', value: Math.round(score) },
      { op: 'add', path: '/fields/Custom.EloPriorityRank', value: rank },
      { op: 'add', path: '/fields/System.Tags', value: `Elo-Rank-${Math.min(rank, 3)}` },
    ]
    await this.client.updateWorkItem(operations, workItemId, project)
  }
}
