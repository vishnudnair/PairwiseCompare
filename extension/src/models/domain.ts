export const supportedWorkItemTypes = ['Epic', 'Feature', 'Requirement', 'User Story', 'Product Backlog Item'] as const
export type WorkItemType = (typeof supportedWorkItemTypes)[number]
export type SessionStatus = 'Draft' | 'Active' | 'Completed' | 'Archived'
export type VoteSelection = 'a' | 'b' | 'equal' | 'skip'
export type UserRole = 'Administrator' | 'Facilitator' | 'Stakeholder' | 'Viewer'
export type SyncStatus = 'Not Synced' | 'Pending' | 'Synced'

export type SharedQueryNode = {
  id: string
  name: string
  path: string
  isFolder: boolean
  children?: SharedQueryNode[]
}

export type QueryReference = {
  id: string
  name: string
  path: string
}

export type SessionConfiguration = {
  confidenceThreshold: number
  maxComparisons: number
  allowTies: boolean
  allowSkip: boolean
  syncEnabled: boolean
}

export const defaultSessionConfiguration: SessionConfiguration = {
  confidenceThreshold: 90,
  maxComparisons: 200,
  allowTies: true,
  allowSkip: true,
  syncEnabled: false,
}

export type WorkItem = {
  id: number
  type: WorkItemType
  title: string
  state: string
  areaPath: string
  iterationPath: string
  businessValue?: number
  tags: string[]
  assignedTo?: string
  description?: string
}

export type Vote = {
  id: string
  sessionId: string
  itemAId: number
  itemBId: number
  selection: VoteSelection
  userId: string
  timestamp: string
}

export type PrioritizationSession = {
  id: string
  projectId: string
  projectName: string
  name: string
  description: string
  status: SessionStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  queryId: string
  queryName: string
  queryPath: string
  lastQueryRefreshDate: string
  workItemIds: number[]
  activeWorkItemIds: number[]
  inactiveWorkItemIds: number[]
  syncStatus: SyncStatus
  votes: Vote[]
  configuration: SessionConfiguration
}

export type RankingRow = {
  rank: number
  workItemId: number
  score: number
  votes: number
  wins: number
  losses: number
  ties: number
}
