import * as SDK from 'azure-devops-extension-sdk'
import type { Feature } from '../ranking'

export type AzureContext = {
  projectId: string
  projectName: string
  features: Feature[]
  isLive: boolean
  error?: string
}

export async function loadAzureContext(fallback: Feature[]): Promise<AzureContext> {
  const localFallback: AzureContext = { projectId: 'local', projectName: 'Local prototype', features: fallback, isLive: false }
  try {
    // Notify Azure DevOps when the hub has initialized; otherwise the host keeps showing its loading screen.
    const hostAvailable = await Promise.race([
      SDK.init({ loaded: true }).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ])
    if (!hostAvailable) return localFallback

    const project = SDK.getWebContext().project
    if (!project) return { ...localFallback, error: 'Azure DevOps did not provide a project context.' }
    return { projectId: project.id, projectName: project.name, features: [], isLive: true }
  } catch (error) {
    console.error('[Adaptive Prioritization] Azure DevOps startup failed:', error)
    const message = error instanceof Error ? error.message : 'Unable to load Azure DevOps work items.'
    return { ...localFallback, error: message }
  }
}

