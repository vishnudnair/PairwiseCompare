import * as SDK from 'azure-devops-extension-sdk'
import type { IExtensionDataService, IExtensionDataManager } from 'azure-devops-extension-api/Common'
import type { PrioritizationSession } from '../models/domain'

const COLLECTION = 'pairwise-sessions'

export interface SessionStore {
  list(projectId: string): Promise<PrioritizationSession[]>
  save(session: PrioritizationSession): Promise<PrioritizationSession>
  remove(id: string): Promise<void>
}

export class AzureDevOpsSessionStore implements SessionStore {
  private manager?: IExtensionDataManager

  private async dataManager(): Promise<IExtensionDataManager> {
    const extensionDataService = await SDK.getService<IExtensionDataService>('ms.vss-features.extension-data-service')
    const accessToken = await SDK.getAccessToken()
    this.manager ??= await extensionDataService.getExtensionDataManager(SDK.getExtensionContext().id, accessToken)
    return this.manager
  }

  async list(projectId: string): Promise<PrioritizationSession[]> {
    const manager = await this.dataManager()
    const records = await manager.getDocuments(COLLECTION) as PrioritizationSession[]
    return records.filter((record) => record.projectId === projectId)
  }

  async save(session: PrioritizationSession): Promise<PrioritizationSession> {
    const manager = await this.dataManager()
    return manager.setDocument(COLLECTION, session)
  }

  async remove(id: string): Promise<void> {
    const manager = await this.dataManager()
    await manager.deleteDocument(COLLECTION, id)
  }
}
