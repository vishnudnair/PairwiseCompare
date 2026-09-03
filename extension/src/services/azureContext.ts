import * as SDK from 'azure-devops-extension-sdk'
import type { IProjectPageService } from 'azure-devops-extension-api/Common'
import type { Feature } from '../ranking'
import { AzureDevOpsWorkItemService } from './azureDevOpsService'
import { supportedWorkItemTypes } from '../models/domain'

export type AzureContext = {
  projectId: string
  projectName: string
  features: Feature[]
  isLive: boolean
}

const toFeature = (item: { id: number; title: string; areaPath: string; state: string; tags: string[]; description?: string; businessValue?: number }): Feature => ({
  id: String(item.id),
  title: item.title,
  area: item.areaPath.split('\\').at(-1) ?? item.areaPath,
  state: item.state,
  tags: item.tags,
  description: item.description ?? 'No description provided.',
  value: item.businessValue === undefined ? 'Business value not set' : `Business value ${item.businessValue}`,
})

export async function loadAzureContext(fallback: Feature[]): Promise<AzureContext> {
  const localFallback: AzureContext = { projectId: 'local', projectName: 'Local prototype', features: fallback, isLive: false }
  try {
    // SDK.init() only resolves when hosted inside an Azure DevOps frame; race it so standalone dev doesn't hang forever.
    const hostAvailable = await Promise.race([
      SDK.init({ loaded: false }).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ])
    if (!hostAvailable) return localFallback

    const projectService = await SDK.getService<IProjectPageService>('ms.vss-tfs-web.tfs-page-data-service')
    const project = await projectService.getProject()
    if (!project) return localFallback
    const service = new AzureDevOpsWorkItemService()
    const workItems = await service.queryWorkItems({ projectId: project.id, types: [...supportedWorkItemTypes] })
    return { projectId: project.id, projectName: project.name, features: workItems.map(toFeature), isLive: true }
  } catch {
    return localFallback
  }
}

