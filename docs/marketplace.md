# Marketplace Publication

## Metadata

- Name: Adaptive Feature Prioritization for Azure DevOps
- Category: Azure Boards
- Tags: Azure DevOps, prioritization, product management, backlog, adaptive Elo ranking
- Publisher: replace `vishnudnair` with the registered Marketplace publisher ID before public release
- Initial visibility: private

## Listing description

Adaptive Feature Prioritization helps product and delivery teams rank Azure Boards work items using an adaptive Elo engine that focuses comparisons on similarly scored, high-uncertainty items instead of requiring exhaustive pairwise comparison. Sessions, votes, and audit events stay within Azure DevOps Extension Data Service. No external service or recurring cloud infrastructure is required.

## Required assets

- Square PNG extension icon, referenced by `vss-extension.json`.
- Screenshots for Shared Query selection, work item selection, adaptive comparison, and ranking results.
- Support URL and privacy statement URL.
- Clear documentation for the `Custom.EloPriorityScore` and `Custom.EloPriorityRank` fields used by synchronization.

## Privacy statement

Adaptive Feature Prioritization does not send data to external APIs or databases. It uses Azure DevOps host authentication, Azure Boards work item and Shared Query APIs, and Azure DevOps Extension Data Service. Session configuration, votes, rankings, and audit events are stored in the Azure DevOps extension data scope. The extension does not request PATs, store credentials, or collect analytics by default.

## Publishing steps

1. Register a Marketplace publisher.
2. Replace the manifest publisher, version, icon, support, and privacy metadata.
3. Run `npm run lint`, `npm run test`, and `npm run package`.
4. Upload the VSIX privately and test it in a non-production Azure DevOps organization.
5. Validate permissions, custom-field availability, Shared Query import, adaptive comparison, persistence, export, and synchronization.
6. Submit the extension for Marketplace validation.
7. Publish only after the validation and privacy review are complete.
