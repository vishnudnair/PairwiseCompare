import { getClient } from 'azure-devops-extension-api'
import { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking'
import type { SharedQueryNode, WorkItem } from '../models/domain'
import { AzureDevOpsWorkItemService } from './azureDevOpsService'

type RawQueryHierarchyItem = {
  id: string
  name: string
  path: string
  isFolder?: boolean
  children?: RawQueryHierarchyItem[]
}

export interface SharedQueryService {
  listQueries(projectId: string): Promise<SharedQueryNode[]>
  searchQueries(projectId: string, term: string): Promise<SharedQueryNode[]>
  runQuery(projectId: string, queryId: string): Promise<WorkItem[]>
}

function toNode(item: RawQueryHierarchyItem): SharedQueryNode {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    isFolder: Boolean(item.isFolder),
    children: item.children?.map(toNode),
  }
}

function flatten(nodes: SharedQueryNode[]): SharedQueryNode[] {
  return nodes.flatMap((node) => (node.isFolder ? flatten(node.children ?? []) : [node]))
}

/** Reads and executes Shared Queries, including recursive folders, using the Work Item Tracking client. */
export class AzureDevOpsSharedQueryService implements SharedQueryService {
  private readonly client = getClient(WorkItemTrackingRestClient)
  private readonly workItemService = new AzureDevOpsWorkItemService()

  async listQueries(projectId: string): Promise<SharedQueryNode[]> {
    const hierarchy = await this.client.getQueries(projectId, undefined, 3, false) as unknown as RawQueryHierarchyItem[]
    return hierarchy.map(toNode)
  }

  async searchQueries(projectId: string, term: string): Promise<SharedQueryNode[]> {
    const all = flatten(await this.listQueries(projectId))
    const lowered = term.trim().toLowerCase()
    if (!lowered) return all
    return all.filter((node) => node.name.toLowerCase().includes(lowered) || node.path.toLowerCase().includes(lowered))
  }

  async runQuery(projectId: string, queryId: string): Promise<WorkItem[]> {
    const result = await this.client.queryById(queryId, projectId)
    const ids = (result.workItems ?? []).map((item) => item.id).filter((id): id is number => id !== undefined)
    return this.workItemService.getWorkItemsByIds(projectId, ids)
  }
}
