# Adaptive Feature Prioritization for Azure DevOps

Adaptive Feature Prioritization is an Azure DevOps extension for ranking Epics, Features, Requirements, User Stories, and Product Backlog Items using an adaptive Elo ranking engine instead of exhaustive pairwise comparison. The extension does not let you select work items from the project backlog. Instead, you **select an Azure DevOps Shared Query**, and Product Owners control the candidate set by maintaining that query. Instead of asking a team to assign subjective priority numbers directly, or to compare every possible pair, it asks a much smaller, targeted set of questions such as:

> Which item delivers more business value: Payment Gateway or Mobile Application?

The adaptive engine prioritizes comparisons between items with similar scores and the highest remaining ranking uncertainty, converging on a stable ranking with far fewer comparisons than the `N * (N - 1) / 2` required by full pairwise comparison. The resulting ranking is based on recorded decisions, comparison confidence, and consistency analysis. It is decision support, not an objective measure of business value.

## Project Status

The repository contains a runnable React/TypeScript extension in `extension/`. It uses Azure DevOps host authentication and Shared Queries as the exclusive source of prioritization candidates. A session stores its selected query reference and refreshes that query when reopened; project-wide backlog scans are not used.

## Goals

- Detect the current Azure DevOps organization and project.
- List, search, browse, and run Shared Queries, including recursive folders.
- Retrieve Epics, Features, Requirements, User Stories, and Product Backlog Items.
- Search and filter items by title, area, and description/tags.
- Run an adaptive Elo comparison session instead of exhaustive pairwise comparison.
- Show confidence, comparison history, wins, losses, ties, and ranking explanations.
- Detect preference cycles such as `A > B`, `B > C`, and `C > A`.
- Save sessions locally without storing credentials.
- Require explicit confirmation before updating Azure DevOps fields.
- Build, test, lint, and package as a private Azure DevOps `.vsix` extension.

## Workflow

The extension is a six-step wizard. Every step supports **Back** and **Next** so you can revise a prior selection, change the Shared Query, or re-run validation without losing progress.

1. **Select Shared Query** — browse Shared Query folders, search by name or path, and select one query. Only that query's work items become prioritization candidates.
2. **Load Query Results** — the query executes immediately and the results (ID, title, type, state, and count) are reviewed before continuing. At least two work items are required.
3. **Validate Ranking Fields** — every distinct work item type in the result set is checked for the standard `Microsoft.VSTS.Common.BusinessValue` and `Microsoft.VSTS.Common.Priority` fields (or mapped equivalents). Comparisons are blocked until every type passes.
4. **Run Adaptive Prioritization** — the adaptive engine selects the next comparison automatically:
   - Left Arrow: Option A has higher priority
   - Right Arrow: Option B has higher priority
   - Down Arrow or `E`: equal priority
   - `S`: skip
   The comparison round ends automatically once overall confidence reaches the configured threshold (default 90%) or the maximum comparison count is reached.
5. **Review Rankings** — review the ranking, confidence, wins/losses/ties, and consistency (preference-cycle) warnings.
6. **Publish Rankings to Azure DevOps** — synchronize the Elo score and rank back to the linked work items. Synchronization status is tracked as **Not Synced**, **Pending**, or **Synced**.

Reopening a session automatically re-executes its linked Shared Query, adds newly returned work items to the ranking pool, marks work items no longer returned by the query as inactive, and preserves historical voting data.

## Architecture

The first version should remain a client-side Azure DevOps extension. A backend is deliberately deferred because local session persistence and Azure DevOps extension authentication are sufficient for the initial workflow.

```text
Azure DevOps
    |
    +-- Extension SDK and Azure DevOps REST APIs
	    |
	    v
    TypeScript extension UI
	    |
	    +-- Feature selection and comparison views
	    +-- Azure DevOps service abstraction
	    +-- Pair selection engine
	    +-- Elo ranking algorithm
	    +-- Confidence and consistency analysis
	    +-- Versioned local session storage
```

The code should keep these concerns independent:

- `services/azureDevOpsService`: organization, project, work item retrieval by ID, and explicit ranking field updates.
- `services/sharedQueryService`: Shared Query hierarchy browsing, search, execution, and refresh — the only source of work items.
- `services/fieldValidationService`: confirms `Microsoft.VSTS.Common.BusinessValue` and `Microsoft.VSTS.Common.Priority` exist on every work item type before comparisons are allowed.
- `models/`: work items, sessions (including query reference and sync status), votes, rankings, roles, and configuration.
- `ranking/`: Elo math, the adaptive comparison engine, and consistency detection.
- `services/extensionDataService`: Extension Data Service session persistence, including the linked query reference and refresh timestamp.
- `App.tsx`: the six-step wizard UI (query selection, review, validation, prioritization, ranking review, synchronization).
- `tests/`: unit tests and mocked Azure DevOps service tests.

The interfaces should allow a future ASP.NET Core API to provide multi-user sessions, aggregation, licensing, or analytics without replacing the ranking engine or UI contracts.

## Ranking Approach

Each selected work item starts with the same Elo rating. A win increases the preferred item's rating and decreases the other's rating. An upset against a higher-rated item produces a larger adjustment. A tie applies a neutral result, while a skipped comparison is not treated as a loss.

The adaptive engine selects informative pairs instead of automatically comparing every possible pair: it prioritizes items with similar scores and the fewest comparisons so far, and avoids repeating the same pair more than twice. It stops when the configured confidence threshold is reached or the maximum comparison count is exhausted.

Confidence reflects comparison coverage and rating separation for each item, and the session-level confidence is the average across all items. The UI must label confidence as an estimate of decision support rather than mathematical certainty.

## Azure DevOps Integration

The extension must use the Azure DevOps Extension SDK and supported REST/client APIs. It must:

- Detect the current organization and project; never hardcode URLs, IDs, or PATs.
- List, search, and execute Shared Queries via `QueryHierarchyItem` and Work Item Query APIs, including recursive folders. **Work items are loaded only from the selected query result set; the project backlog is never listed or scanned.**
- Retrieve fields such as title, description, Area Path, Iteration Path, State, Assigned To, Business Value, and Tags for the query result set.
- Validate that `Microsoft.VSTS.Common.BusinessValue` and `Microsoft.VSTS.Common.Priority` exist on every distinct work item type in the result set via `getWorkItemTypeFieldsWithReferences` before comparisons are allowed.
- Handle deleted or changed work items, authentication expiry, permission failures, rate limits, and transient network errors.
- Update only the ranking fields after the user explicitly starts synchronization in step 6.

Synchronization writes the Elo score to `Microsoft.VSTS.Common.BusinessValue` and the Elo rank (capped at 1-4) to `Microsoft.VSTS.Common.Priority` for the ranked items. Write-back must never happen automatically.

## Required Azure DevOps Fields

Before running comparisons, the target work item type(s) must have these two standard fields. The extension validates this in step 3 of the wizard and blocks progress with a warning if either field is missing.

| Display Name | Reference Name | Type | Suggested Configuration |
| --- | --- | --- | --- |
| Business Value | `Microsoft.VSTS.Common.BusinessValue` | Integer | Standard Business Value field, used to store the Elo score. |
| Priority | `Microsoft.VSTS.Common.Priority` | Integer (1-4) | Standard Priority field, used to store the Elo rank (capped at 4). |

Both fields are included by default on most Azure DevOps process templates (Agile, Scrum, CMMI) for Epic, Feature, Product Backlog Item, and User Story. Validation typically passes without extra configuration; only custom or inherited work item types that removed these fields need the steps below.

### Creating the fields (if missing)

1. In Azure DevOps, go to **Organization Settings > Process**.
2. Select the process used by your project (do not edit inherited system processes directly).
3. Open the work item type (for example, **Feature** or **Product Backlog Item**) that your Shared Query returns.
4. Select **New field**, then add the existing standard field:
   - Name: `Business Value`, Reference name: `Microsoft.VSTS.Common.BusinessValue`.
   - Name: `Priority`, Reference name: `Microsoft.VSTS.Common.Priority`.
5. Save the field and add it to a page/group on the work item type's layout (the field must be present on the type definition even if hidden from the form).
6. Repeat for every work item type your Shared Query can return (for example, both **Feature** and **Epic** if the query spans types).

### How field validation works

- Step 3 of the wizard calls `getWorkItemTypeFieldsWithReferences` for each distinct work item type in the query results and checks for both reference names.
- If both fields are present on a type, that type is marked valid and the wizard allows **Next**.
- If either field is missing, the wizard shows the missing field's display name, reference name, type, and suggested configuration, and blocks **Next** until the fields are added and re-validated.
- Use **Download Field Configuration Guide** on the validation screen to open Microsoft's custom field documentation.

### Mapping fields within the extension

The reference names `Microsoft.VSTS.Common.BusinessValue` and `Microsoft.VSTS.Common.Priority` are fixed in `extension/src/services/fieldValidationService.ts`. If your organization uses different reference names, update `requiredRankingFields` in that file to match your process before packaging.

## Persistence and Privacy

Sessions persist through the Azure DevOps Extension Data Service (with local storage as a fallback if unavailable). Stored data includes the linked query reference (ID, name, path), project ID and name, session name, active/inactive work-item IDs, synchronization status, and derived results, but must not include tokens, PATs, or client secrets.

Storage must validate its schema, handle corrupted records gracefully, and provide migration paths for future versions. Analytics are not collected by default. Any future analytics must be opt-in and privacy-conscious.

## Accessibility and UX

The extension should feel native to Azure DevOps: compact hierarchy, clear progress, responsive layouts, accessible contrast, semantic HTML, visible focus, keyboard navigation, loading states, empty states, recoverable errors, and accessible confirmation dialogs. Color must not be the only way to communicate ranking, confidence, or outcomes.

## UI and Branding

The UI uses only Azure DevOps-compatible colors and Fluent UI design conventions — no custom brand palette:

- Azure DevOps Blue (`#0078D4`) for primary actions and links.
- Fluent neutral grays for surfaces, borders, and text (`extension/src/App.css` custom properties `--neutral-bg-*`, `--neutral-fg-*`, `--neutral-stroke-*`).
- Fluent status colors for success, warning, error, and pending states (`--status-success-*`, `--status-warning-*`, `--status-error-*`, `--status-pending-*`), used for the synchronization pill and field-validation cards.
- Light and dark themes are applied automatically via `prefers-color-scheme`, matching Azure DevOps' light and dark theme colors.
- Windows/browser high-contrast mode is supported automatically via the `forced-colors` media query, which maps all tokens to system colors (`Canvas`, `CanvasText`, `LinkText`, `ButtonFace`, `GrayText`).
- All interactive controls have visible `:focus-visible` outlines, and the layout is responsive down to narrow widths.

## Session Dashboard

From step 2 onward, a query banner shows:

- Query name and path.
- Current work item count.
- Last refresh timestamp.
- Synchronization status pill (**Not Synced**, **Pending**, **Synced**).
- A **Refresh Query Results** action that re-executes the query, updates active/inactive work items, and recalculates comparison eligibility.

Step 6 additionally shows ranking statistics: total work items, total comparisons, completion percentage, and confidence percentage.

## Development

The extension uses Node.js, TypeScript, React, Vite, Fluent UI, Azure DevOps Extension SDK/API, and Oxlint. Run these commands from `extension/`:

```powershell
npm install
npm run lint
npm run test
npm run build
npm run package
npm run dev
```

The Vite development server is available at the URL it prints, normally `http://localhost:5173`. No .NET SDK or backend is required.

## Screenshots

Capture and add these screenshots to `docs/` before publishing:

1. **Query Selection** — Shared Query folder browser with search.
2. **Query Results Review** — result count, IDs, titles, and types.
3. **Field Validation** — both the valid state and the missing-fields warning.
4. **Comparison Screen** — an in-progress adaptive comparison with confidence progress.
5. **Ranking Dashboard** — the review-rankings screen with confidence and cycle warnings.
6. **Synchronization Screen** — the sync status pill and publish action.

## User Guide

### Selecting a Shared Query

1. Open the extension from the Azure Boards hub.
2. On **Select Shared Query**, search or browse folders to find the query maintained by your Product Owner.
3. Select the query. Its results load immediately and are shown on the same step.
4. Select **Next** to continue.

### Validating fields

1. On **Validate Required Fields**, wait for validation to complete for every work item type returned by the query.
2. If a type is missing `Microsoft.VSTS.Common.BusinessValue` or `Microsoft.VSTS.Common.Priority`, follow the on-screen instructions or select **Download Field Configuration Guide**.
3. Create the missing fields in Azure DevOps (see [Required Azure DevOps Fields](#required-azure-devops-fields)), then select **Back** and **Next** again to re-run validation.

### Running prioritization

1. On **Adaptive Prioritization**, select **Start Adaptive Prioritization**.
2. Compare pairs using the buttons or keyboard shortcuts until the round completes.
3. Select **Next** once comparisons are complete to review rankings.

### Publishing rankings

1. On **Review Rankings**, confirm the ranking, confidence, and any consistency warnings.
2. Select **Next** to open **Synchronize Rankings**.
3. Select **Synchronize Rankings to Azure DevOps**. The status pill updates from **Pending** to **Synced** on success.
4. Select **Finish** to start a new session with a different Shared Query.

## Testing Strategy

Tests should not make production Azure DevOps calls. The suite covers:

- Elo wins, losses, ties, skips, and upset calculations.
- Adaptive pair selection, repeat-pair avoidance, confidence growth, and completion rules (confidence threshold and max comparisons).
- Preference-cycle detection.
- Ranking explanations derived only from recorded decisions.

Remaining suite work: session serialization/migration/corrupted-storage tests, Shared Query and work item service integration tests against mocks, and end-to-end session-to-sync coverage.

CI runs dependency installation, linting, unit tests, build, and VSIX packaging. Marketplace publication must be a controlled release action, not an automatic step on every commit.

## Packaging and Azure DevOps Installation

The finished extension will include `vss-extension.json` with semantic versioning, publisher metadata, categories, icon, support links, and privacy information where required. Initial releases should be private for testing in a non-production organization.

The release process is:

1. Run lint, tests, and the production build.
2. Create the `.vsix` package.
3. Validate the manifest and install the private extension in a test Azure DevOps organization.
4. Verify project detection, Shared Query import, adaptive comparison, persistence, and confirmed write-back.
5. Publish to the Visual Studio Marketplace only through a deliberate release workflow.

## Security Considerations

- Use Azure DevOps-provided authentication; never request or embed PATs in the extension.
- Never commit credentials, client secrets, or tokens.
- Do not send session data to third parties without explicit product design and user consent.
- Treat work item content as untrusted input and avoid unsafe HTML injection.
- Use HTTPS for any future backend.
- Log useful diagnostic context without tokens or unnecessary personal data.

## Known Limitations

Live Azure DevOps loading requires the extension to run inside an Azure DevOps host; there is no project-backlog fallback by design. Synchronization requires the `Microsoft.VSTS.Common.BusinessValue` and `Microsoft.VSTS.Common.Priority` fields to exist on every work item type returned by the selected query, and requires permission to update work items. Participation charts, ranking trend charts, and Excel export are not yet built. Adaptive Elo rankings represent stakeholder preferences and can be affected by sparse comparisons, inconsistent decisions, incomplete work item information, and changing priorities.

## Roadmap

1. Add full session lifecycle management (create/resume/archive) through Extension Data Service.
2. Add multi-stakeholder vote aggregation, role enforcement in the UI, and an audit/participation dashboard.
3. Add ranking trend and confidence-growth charts, plus Excel export alongside CSV.
4. Add an explicit synchronization preview/confirmation screen with configurable field mapping.
5. Validate custom-field synchronization and permissions in a test Azure DevOps organization.
6. Consider advanced algorithms, weighted criteria, or analytics without adding recurring infrastructure.

## License

See [LICENSE](LICENSE).
