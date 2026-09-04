# Deployment and Marketplace Guide

## Local development

1. Install Node.js 22 or newer.
2. Run `npm ci` from `extension/`.
3. Run `npm run dev` for the local fallback experience.
4. Run the extension inside Azure DevOps to exercise live project and work item loading. The host must provide the Azure DevOps Extension SDK context.

## Build and package

From `extension/`:

```powershell
npm ci
npm run lint
npm run test
npm run package
```

The package command creates `adaptive-feature-prioritization.vsix`.

## Test in Azure DevOps

1. Install `tfx-cli` or use the repository package script.
2. Create a publisher in the Visual Studio Marketplace publisher portal.
3. Update the `publisher` value in `extension/vss-extension.json` to the publisher ID.
4. Create a private VSIX with `npm run package`.
5. Upload the VSIX to the publisher portal or install it with `tfx extension install`.
6. Open a project where the installing identity can read work items, Shared Queries, and the extension data service.
7. Verify project detection, Shared Query import, adaptive comparisons, session persistence, and ranking synchronization.

No Azure subscription or external infrastructure is required. The extension uses Azure DevOps host services and Extension Data Service.

## Release strategy

Use semantic versions in `vss-extension.json`. Pull requests run lint, tests, and packaging. Main builds publish the VSIX as an artifact. Marketplace upload should be a controlled release action after testing in a private organization.

## Marketplace checklist

- Replace the placeholder publisher with the registered publisher ID.
- Add a square PNG icon and reference it from the manifest.
- Add screenshots showing selection, comparison, and results views.
- Provide a support URL and privacy statement.
- Validate work item custom fields `Custom.EloPriorityScore` and `Custom.EloPriorityRank` exist before enabling synchronization.
- Document that votes and sessions are stored in Azure DevOps Extension Data Service and not sent to external infrastructure.
