import { getClient } from 'azure-devops-extension-api'
import { WorkItemTrackingRestClient } from 'azure-devops-extension-api/WorkItemTracking'
import type { WorkItemType } from '../models/domain'

export type RequiredFieldDefinition = {
  referenceName: string
  displayName: string
  fieldType: string
  suggestedConfiguration: string
}

export const requiredRankingFields: RequiredFieldDefinition[] = [
  { referenceName: 'Microsoft.VSTS.Common.BusinessValue', displayName: 'Business Value', fieldType: 'Integer', suggestedConfiguration: 'Standard Business Value field, used to store the Elo score.' },
  { referenceName: 'Microsoft.VSTS.Common.Priority', displayName: 'Priority', fieldType: 'Integer (1-4)', suggestedConfiguration: 'Standard Priority field, used to store the Elo rank (capped at 4).' },
]

export type FieldValidationResult = {
  isValid: boolean
  missingFields: RequiredFieldDefinition[]
  workItemType: WorkItemType
}

export interface FieldValidationService {
  validateWorkItemType(projectId: string, workItemType: WorkItemType): Promise<FieldValidationResult>
}

/** Confirms Business Value and Priority are present on a work item type before ranking sync is enabled. */
export class AzureDevOpsFieldValidationService implements FieldValidationService {
  private readonly client = getClient(WorkItemTrackingRestClient)

  async validateWorkItemType(projectId: string, workItemType: WorkItemType): Promise<FieldValidationResult> {
    const fields = await this.client.getWorkItemTypeFieldsWithReferences(projectId, workItemType)
    const referenceNames = new Set(fields.map((field) => field.referenceName))
    const missingFields = requiredRankingFields.filter((required) => !referenceNames.has(required.referenceName))
    return { isValid: missingFields.length === 0, missingFields, workItemType }
  }
}
