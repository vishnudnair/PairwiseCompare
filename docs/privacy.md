# Privacy Statement

Adaptive Feature Prioritization for Azure DevOps is designed to run entirely inside Azure DevOps. It does not use a backend, Azure subscription resources, external APIs, advertising, or third-party analytics.

The extension accesses Azure Boards work item data needed for the active prioritization session and stores session data, votes, rankings, configuration, and audit events using Azure DevOps Extension Data Service. Access is governed by the user's Azure DevOps identity and permissions.

The extension does not request, store, or transmit personal access tokens, client secrets, or host authentication credentials. Assigned-to display names and voter identity values may appear in session and audit data because they are part of the Azure DevOps workflow.

Users should remove saved sessions when the data is no longer needed and should follow their organization's Azure DevOps retention and access policies.
