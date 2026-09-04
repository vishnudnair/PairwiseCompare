# Adaptive Feature Prioritization for Azure DevOps

Adaptive Feature Prioritization is an Azure DevOps extension for ranking Epics, Features, Requirements, User Stories, and Product Backlog Items using an adaptive Elo ranking engine instead of exhaustive pairwise comparison. Instead of asking a team to assign subjective priority numbers directly, or to compare every possible pair, it asks a much smaller, targeted set of questions such as:

> Which item delivers more business value: Payment Gateway or Mobile Application?

The adaptive engine prioritizes comparisons between items with similar scores and the highest remaining ranking uncertainty, converging on a stable ranking with far fewer comparisons than the `N * (N - 1) / 2` required by full pairwise comparison. The resulting ranking is based on recorded decisions, comparison confidence, and consistency analysis. It is decision support, not an objective measure of business value.

## Project Status

The repository contains a runnable React/TypeScript extension in `extension/`. It uses Azure DevOps host authentication, Work Item Tracking APIs, and Shared Query retrieval when opened in Azure DevOps, with representative local data as a standalone-development fallback. Session storage, the adaptive Elo engine, tests, CI, and VSIX packaging are implemented; the full dashboard (charts, stakeholder participation), Excel export, session lifecycle management UI, and organization-specific validation remain deployment steps.

## Goals

- Detect the current Azure DevOps organization and project.
- List, search, and run Shared Queries, including recursive folders.
- Retrieve Epics, Features, Requirements, User Stories, and Product Backlog Items.
- Search and filter items by title, area, and description/tags.
- Run an adaptive Elo comparison session instead of exhaustive pairwise comparison.
- Show confidence, comparison history, wins, losses, ties, and ranking explanations.
- Detect preference cycles such as `A > B`, `B > C`, and `C > A`.
- Save sessions locally without storing credentials.
- Require explicit confirmation before updating Azure DevOps fields.
- Build, test, lint, and package as a private Azure DevOps `.vsix` extension.

## User Workflow

1. Select a project. Live projects can optionally select a Shared Query to import its results.
2. Filter the list and select at least two work items.
3. Start the session. The adaptive engine selects the next comparison automatically.
4. Compare pairs using buttons or keyboard controls:
   - Left Arrow: Option A has higher priority
   - Right Arrow: Option B has higher priority
   - Down Arrow or `E`: equal priority
   - `S`: skip
5. The session ends automatically once overall confidence reaches the configured threshold (default 90%) or the maximum comparison count is reached.
6. Review the ranking, confidence, explanations, and consistency warnings.
7. Optionally preview and confirm Azure DevOps write-back.

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

- `services/azureDevOpsService`: organization, project, WIQL, work item retrieval, and explicit updates.
- `services/sharedQueryService`: Shared Query listing, search, and execution.
- `models/`: work items, sessions, votes, rankings, roles, and configuration.
- `ranking/`: Elo math, the adaptive comparison engine, and consistency detection.
- `storage/` (`services/extensionDataService`): Extension Data Service session persistence.
- `components/` and `pages/`: accessible workflow UI.
- `tests/`: unit tests and mocked Azure DevOps service tests.

The interfaces should allow a future ASP.NET Core API to provide multi-user sessions, aggregation, licensing, or analytics without replacing the ranking engine or UI contracts.

## Ranking Approach

Each selected work item starts with the same Elo rating. A win increases the preferred item's rating and decreases the other's rating. An upset against a higher-rated item produces a larger adjustment. A tie applies a neutral result, while a skipped comparison is not treated as a loss.

The adaptive engine selects informative pairs instead of automatically comparing every possible pair: it prioritizes items with similar scores and the fewest comparisons so far, and avoids repeating the same pair more than twice. It stops when the configured confidence threshold is reached or the maximum comparison count is exhausted.

Confidence reflects comparison coverage and rating separation for each item, and the session-level confidence is the average across all items. The UI must label confidence as an estimate of decision support rather than mathematical certainty.

## Azure DevOps Integration

The extension must use the Azure DevOps Extension SDK and supported REST/client APIs. It must:

- Detect the current organization and project; never hardcode URLs, IDs, or PATs.
- List, search, and execute Shared Queries, including recursive folders, or query directly by WIQL for supported types (Epic, Feature, Requirement, User Story, Product Backlog Item).
- Retrieve fields such as title, description, Area Path, Iteration Path, State, Assigned To, Business Value, and Tags.
- Handle pagination, large backlogs, deleted or changed work items, authentication expiry, permission failures, rate limits, and transient network errors.
- Update only explicitly selected fields after a preview and confirmation step.

Synchronization writes `Custom.EloPriorityScore`, `Custom.EloPriorityRank`, and an `Elo-Rank-N` tag (capped at rank 3) for the top-ranked items. Write-back must never happen automatically.

## Persistence and Privacy

V1 session data should use versioned browser/local storage. Stored data may include project metadata, selected Feature IDs, comparisons, configuration, and derived results, but must not include tokens, PATs, or client secrets.

Storage must validate its schema, handle corrupted records gracefully, and provide migration paths for future versions. Analytics are not collected by default. Any future analytics must be opt-in and privacy-conscious.

## Accessibility and UX

The extension should feel native to Azure DevOps: compact hierarchy, clear progress, responsive layouts, accessible contrast, semantic HTML, visible focus, keyboard navigation, loading states, empty states, recoverable errors, and accessible confirmation dialogs. Color must not be the only way to communicate ranking, confidence, or outcomes.

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

The standalone fallback uses local demo work items and browser local storage. Live Azure DevOps loading requires the extension to run inside an Azure DevOps host. Synchronization requires the `Custom.EloPriorityScore` and `Custom.EloPriorityRank` fields to exist and requires administrator permission. The dashboard currently shows the ranked list and confidence; participation charts, ranking trend charts, and Excel export are not yet built. Adaptive Elo rankings represent stakeholder preferences and can be affected by sparse comparisons, inconsistent decisions, incomplete work item information, and changing priorities.

## Roadmap

1. Add full session lifecycle management (create/resume/archive) through Extension Data Service.
2. Add multi-stakeholder vote aggregation, role enforcement in the UI, and an audit/participation dashboard.
3. Add ranking trend and confidence-growth charts, plus Excel export alongside CSV.
4. Add an explicit synchronization preview/confirmation screen with configurable field mapping.
5. Validate custom-field synchronization and permissions in a test Azure DevOps organization.
6. Consider advanced algorithms, weighted criteria, or analytics without adding recurring infrastructure.

## License

See [LICENSE](LICENSE).
