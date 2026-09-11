import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './App.css'
import { detectCycles, type Comparison, type Feature } from './ranking'
import { AdaptiveEloEngine, type AdaptivePair, type AdaptiveResult } from './ranking/adaptiveEngine'
import { loadAzureContext } from './services/azureContext'
import { AzureDevOpsSharedQueryService } from './services/sharedQueryService'
import { AzureDevOpsSessionStore } from './services/extensionDataService'
import { AzureDevOpsWorkItemService } from './services/azureDevOpsService'
import { AzureDevOpsFieldValidationService, requiredRankingFields, type FieldValidationResult } from './services/fieldValidationService'
import { defaultSessionConfiguration, type QueryReference, type SharedQueryNode, type WorkItem, type WorkItemType, type PrioritizationSession, type SyncStatus } from './models/domain'

/** The six mandatory wizard stages: query selection through synchronization. */
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

const stepLabels: Record<WizardStep, string> = {
  1: 'Select Shared Query',
  2: 'Review Query Results',
  3: 'Validate Required Fields',
  4: 'Adaptive Prioritization',
  5: 'Review Rankings',
  6: 'Synchronize Rankings',
}

function toFeature(item: WorkItem): Feature {
  return { id: String(item.id), title: item.title, area: item.areaPath.split('\\').at(-1) ?? item.areaPath, state: item.state, tags: item.tags, description: item.description ?? 'No description provided.', value: item.businessValue === undefined ? 'Business value not set' : `Business value ${item.businessValue}` }
}

function distinctWorkItemTypes(items: WorkItem[]): WorkItemType[] {
  return [...new Set(items.map((item) => item.type))]
}

function App() {
  const [availableFeatures, setAvailableFeatures] = useState<Feature[]>([])
  const [projectId, setProjectId] = useState('local')
  const [projectName, setProjectName] = useState('Local prototype')
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sharedQueries, setSharedQueries] = useState<SharedQueryNode[]>([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [querySearch, setQuerySearch] = useState('')
  const [selectedQuery, setSelectedQuery] = useState<QueryReference | null>(null)
  const [queryResults, setQueryResults] = useState<WorkItem[]>([])
  const [step, setStep] = useState<WizardStep>(1)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState('')
  const [lastQueryRefresh, setLastQueryRefresh] = useState<string | null>(null)
  const [inactiveWorkItemIds, setInactiveWorkItemIds] = useState<number[]>([])
  const [fieldValidations, setFieldValidations] = useState<FieldValidationResult[] | null>(null)
  const [validationLoading, setValidationLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('Not Synced')
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const [selected, setSelected] = useState<string[]>([])
  const [comparisonLog, setComparisonLog] = useState<Comparison[]>([])
  const [currentPair, setCurrentPair] = useState<AdaptivePair | null>(null)
  const [comparisonsStarted, setComparisonsStarted] = useState(false)

  const engine = useRef(new AdaptiveEloEngine())
  const confidenceThreshold = defaultSessionConfiguration.confidenceThreshold
  const maxComparisons = defaultSessionConfiguration.maxComparisons

  useEffect(() => {
    loadAzureContext([]).then((context) => {
      setAvailableFeatures(context.features)
      setProjectId(context.projectId)
      setProjectName(context.projectName)
      setIsLive(context.isLive)
      setLoadError(context.error ?? null)
      setLoading(false)
      if (context.isLive) {
        setQueryLoading(true)
        new AzureDevOpsSharedQueryService()
          .listQueries(context.projectId)
          .then(async (queries) => {
            setSharedQueries(queries)
            const sessions = await new AzureDevOpsSessionStore().list(context.projectId).catch(() => [])
            const latest = [...sessions].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
            const query = latest && findQuery(queries, latest.queryId)
            if (!latest || !query) return
            const items = await new AzureDevOpsSharedQueryService().refreshQueryResults(context.projectId, latest.queryId)
            setSelectedQuery({ id: query.id, name: query.name, path: query.path })
            setQueryResults(items)
            setAvailableFeatures(items.map(toFeature))
            setSelected(items.map((item) => String(item.id)))
            setSessionId(latest.id)
            setSessionName(latest.name)
            setInactiveWorkItemIds(latest.inactiveWorkItemIds)
            setSyncStatus(latest.syncStatus ?? 'Not Synced')
            setLastQueryRefresh(new Date().toISOString())
            setStep(2)
          })
          .catch((error) => { console.error('[Adaptive Prioritization] Shared Query list failed:', error); setLoadError(error instanceof Error ? error.message : 'Unable to list Shared Queries.') })
          .finally(() => setQueryLoading(false))
      }
    })
  }, [])


  const selectedFeatures = availableFeatures.filter((feature) => selected.includes(feature.id))
  const featureById = useMemo(() => new Map(availableFeatures.map((feature) => [feature.id, feature])), [availableFeatures])
  const rankings = useMemo(() => engine.current.getRanking().map((row) => ({ ...row, feature: featureById.get(row.id) })), [comparisonLog, featureById])
  const cycles = useMemo(() => detectCycles(selectedFeatures, comparisonLog), [selectedFeatures, comparisonLog])
  const overallConfidence = engine.current.getOverallConfidence()
  const comparisonsSoFar = engine.current.getRanking().reduce((sum, row) => sum + row.comparisons, 0) / 2
  const completionPercentage = selectedFeatures.length > 1 ? Math.min(100, Math.round((comparisonsSoFar / (selectedFeatures.length * 2)) * 100)) : 0
  const fieldsValid = fieldValidations !== null && fieldValidations.every((result) => result.isValid)

  useEffect(() => {
    if (step !== 3 || !selectedQuery || queryResults.length === 0) return
    setValidationLoading(true)
    setValidationError(null)
    const types = distinctWorkItemTypes(queryResults)
    const validator = new AzureDevOpsFieldValidationService()
    Promise.all(types.map((type) => validator.validateWorkItemType(projectId, type)))
      .then(setFieldValidations)
      .catch((error) => setValidationError(error instanceof Error ? error.message : 'Unable to validate ranking fields.'))
      .finally(() => setValidationLoading(false))
  }, [step, selectedQuery, queryResults, projectId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (step !== 4 || !currentPair) return
      if (event.key === 'ArrowLeft') record('a')
      if (event.key === 'ArrowRight') record('b')
      if (event.key.toLowerCase() === 'e' || event.key === 'ArrowDown') record('equal')
      if (event.key.toLowerCase() === 's') record('skip')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function persistSession(overrides: Partial<PrioritizationSession> = {}): Promise<void> {
    if (!selectedQuery) return Promise.resolve()
    const now = new Date().toISOString()
    const session: PrioritizationSession = {
      id: sessionId ?? crypto.randomUUID(),
      projectId, projectName,
      name: sessionName || `${selectedQuery.name} Prioritization`,
      description: '', status: 'Active',
      createdBy: 'current-user', createdAt: now, updatedAt: now,
      queryId: selectedQuery.id, queryName: selectedQuery.name, queryPath: selectedQuery.path,
      lastQueryRefreshDate: lastQueryRefresh ?? now,
      workItemIds: queryResults.map((item) => item.id),
      activeWorkItemIds: queryResults.map((item) => item.id),
      inactiveWorkItemIds, syncStatus, votes: [], configuration: defaultSessionConfiguration,
      ...overrides,
    }
    return new AzureDevOpsSessionStore().save(session).then(() => setSessionId(session.id))
      .catch((error) => console.error('[Adaptive Prioritization] Session save failed:', error))
  }

  function applySharedQuery(queryId: string) {
    if (!queryId) return
    setQueryLoading(true)
    new AzureDevOpsSharedQueryService()
      .runQuery(projectId, queryId)
      .then((items) => {
        const query = findQuery(sharedQueries, queryId)
        setQueryResults(items)
        setAvailableFeatures(items.map(toFeature))
        setSelected(items.map((item) => String(item.id)))
        if (query) { setSelectedQuery({ id: query.id, name: query.name, path: query.path }); setSessionName(`${query.name} Prioritization`) }
        setLastQueryRefresh(new Date().toISOString())
        setFieldValidations(null)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to execute the selected Shared Query.'))
      .finally(() => setQueryLoading(false))
  }

  function refreshQueryResults() {
    if (!selectedQuery) return
    setQueryLoading(true)
    new AzureDevOpsSharedQueryService().refreshQueryResults(projectId, selectedQuery.id)
      .then((items) => {
        const previousIds = new Set(queryResults.map((item) => item.id))
        const currentIds = new Set(items.map((item) => item.id))
        const nextInactive = [...new Set([...inactiveWorkItemIds, ...[...previousIds].filter((id) => !currentIds.has(id))])]
        setInactiveWorkItemIds(nextInactive)
        setQueryResults(items)
        setAvailableFeatures(items.map(toFeature))
        setSelected(items.map((item) => String(item.id)))
        setLastQueryRefresh(new Date().toISOString())
        setFieldValidations(null)
        persistSession({ inactiveWorkItemIds: nextInactive, workItemIds: items.map((item) => item.id), activeWorkItemIds: items.map((item) => item.id) })
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to refresh the Shared Query.'))
      .finally(() => setQueryLoading(false))
  }

  function record(result: AdaptiveResult) {
    if (!currentPair) return
    const [featureA, featureB] = currentPair
    engine.current.recordComparison(featureA.id, featureB.id, result)
    if (result !== 'skip') {
      setComparisonLog((current) => [...current, { featureAId: featureA.id, featureBId: featureB.id, result: result === 'equal' ? 'tie' : result }])
    }
    if (engine.current.isComplete(confidenceThreshold, maxComparisons)) { setStep(5); return }
    setCurrentPair(engine.current.getNextComparison())
  }

  function startComparisons() {
    engine.current.initialize(selectedFeatures)
    setComparisonLog([])
    setCurrentPair(engine.current.getNextComparison())
    setComparisonsStarted(true)
  }

  function synchronizeRankings() {
    setSyncing(true)
    setSyncError(null)
    setSyncStatus('Pending')
    const service = new AzureDevOpsWorkItemService()
    const ranked = engine.current.getRanking()
    Promise.all(ranked.map((row) => service.updateRanking(projectId, Number(row.id), row.score, row.rank)))
      .then(() => { setSyncStatus('Synced'); return persistSession({ status: 'Completed', syncStatus: 'Synced' }) })
      .catch((error) => { setSyncStatus('Not Synced'); setSyncError(error instanceof Error ? error.message : 'Unable to synchronize rankings to Azure DevOps.') })
      .finally(() => setSyncing(false))
  }

  function goNext() {
    if (step === 4 && !engine.current.isComplete(confidenceThreshold, maxComparisons) && comparisonsStarted) return
    if (step === 1 && selectedQuery) persistSession()
    if (step < 6) setStep((current) => (current + 1) as WizardStep)
  }

  function goBack() {
    if (step > 1) setStep((current) => (current - 1) as WizardStep)
  }

  function finishSession() {
    engine.current = new AdaptiveEloEngine()
    setComparisonLog([]); setCurrentPair(null); setComparisonsStarted(false)
    setFieldValidations(null); setSyncStatus('Not Synced'); setSyncError(null)
    setSelectedQuery(null); setQueryResults([]); setAvailableFeatures([]); setSelected([])
    setSessionId(null); setSessionName('')
    setStep(1)
  }

  const topRanking = rankings[0]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">A</div>
        <div><strong>Adaptive Prioritization</strong><span>Boards work item ranking</span></div>
        <div className="project-pill"><span className="status-dot" /> {projectName}</div>
      </header>
      <div className="content">
        <div className="eyebrow">
          Azure Boards <span>/</span> {projectName} {isLive && <em className="live-label">LIVE</em>}
        </div>
        <div className="title-row">
          <div>
            <h1>{stepLabels[step]}</h1>
            <p>
              {step === 1 && 'Product Owners define candidates by managing a Shared Query. Select one to begin.'}
              {step === 2 && 'Confirm the work items returned by the selected query before prioritizing them.'}
              {step === 3 && 'Ranking fields must exist on every work item type before comparisons can start.'}
              {step === 4 && 'The engine compares items with similar scores first, needing far fewer decisions than full pairwise comparison.'}
              {step === 5 && 'A transparent, confidence-scored ranking built from adaptive Elo comparisons.'}
              {step === 6 && 'Publish the final Elo score and rank back to the linked work items in Azure DevOps.'}
            </p>
          </div>
        </div>

        <nav className="wizard-steps" aria-label="Prioritization wizard steps">
          {([1, 2, 3, 4, 5, 6] as WizardStep[]).map((value) => (
            <b key={value} className={step === value ? 'active' : step > value ? 'done' : ''}>{value}. {stepLabels[value]}</b>
          ))}
        </nav>

        {loading && <div className="loading-state">Connecting to Azure Boards<span>...</span></div>}

        {!loading && loadError && (
          <div className="error-state" role="alert">
            <strong>Azure Boards could not load work items.</strong>
            <span>{loadError}</span>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        {!loading && !isLive && (
          <div className="error-state" role="alert">
            <strong>Open this extension inside an Azure DevOps project.</strong>
            <span>Prioritization is driven exclusively by Shared Queries. No project backlog fallback is available.</span>
          </div>
        )}

        {!loading && isLive && selectedQuery && step > 1 && (
          <section className="query-banner" aria-label="Selected Shared Query">
            <span><b>{selectedQuery.name}</b><small>{selectedQuery.path}</small></span>
            <span className="query-banner-stats">
              <b>{queryResults.length}</b> work items
              {lastQueryRefresh && <small> · refreshed {new Date(lastQueryRefresh).toLocaleString()}</small>}
              <span className={`sync-pill sync-${syncStatus.replace(/\s+/g, '-').toLowerCase()}`}>{syncStatus}</span>
            </span>
            <button className="secondary-button" onClick={refreshQueryResults} disabled={queryLoading}>Refresh Query Results</button>
          </section>
        )}

        {!loading && isLive && step === 1 && (
          <section className="query-browser" aria-label="Select a Shared Query">
            <label className="search"><span>⌕</span><input value={querySearch} onChange={(event) => setQuerySearch(event.target.value)} placeholder="Search Shared Queries" /></label>
            {queryLoading && <div className="loading-state">Loading Shared Queries<span>...</span></div>}
            <div className="query-tree">{filterQueries(sharedQueries, querySearch).map((node) => renderQueryNode(node, (query) => applySharedQuery(query.id)))}</div>
          </section>
        )}

        {!loading && isLive && step === 2 && (
          <section className="query-review" aria-label="Review query results">
            <div className="query-summary">
              <span className="panel-kicker">SELECTED SHARED QUERY</span>
              <strong>{selectedQuery?.name}</strong>
              <span>{selectedQuery?.path}</span>
              <b>{queryResults.length} work items</b>
            </div>
            <label>Session name<input value={sessionName} onChange={(event) => setSessionName(event.target.value)} placeholder="Q1 Roadmap Prioritization" /></label>
            <div className="feature-list">
              {queryResults.map((item) => (
                <div className="feature-row" key={item.id}>
                  <span className="feature-copy"><strong>#{item.id} {item.title}</strong><small>{item.type} · {item.state}</small></span>
                </div>
              ))}
            </div>
            {queryResults.length < 2 && <small className="warning">The selected query must return at least two work items.</small>}
          </section>
        )}

        {!loading && isLive && step === 3 && (
          <section className="field-validation" aria-label="Validate required work item fields">
            {validationLoading && <div className="loading-state">Validating ranking fields<span>...</span></div>}
            {validationError && <div className="error-state" role="alert"><strong>Field validation failed.</strong><span>{validationError}</span></div>}
            {!validationLoading && fieldValidations && fieldValidations.map((result) => (
              <div className={`validation-card ${result.isValid ? 'valid' : 'invalid'}`} key={result.workItemType}>
                <strong>{result.workItemType}</strong>
                {result.isValid
                  ? <span>✓ Required ranking fields are present.</span>
                  : (
                    <>
                      <span>⚠ The selected work item type is missing required ranking fields.</span>
                      <p>Required Fields:</p>
                      <ul>
                        {result.missingFields.map((field) => (
                          <li key={field.referenceName}>
                            <b>{field.displayName}</b> — reference name <code>{field.referenceName}</code>, type {field.fieldType}
                            <small>{field.suggestedConfiguration}</small>
                          </li>
                        ))}
                      </ul>
                      <p>Please create the fields and add them to the <b>{result.workItemType}</b> work item type before continuing.</p>
                    </>
                  )}
              </div>
            ))}
            {!validationLoading && fieldValidations && !fieldsValid && (
              <a className="secondary-button field-guide-link" href="https://learn.microsoft.com/azure/devops/organizations/settings/work/add-custom-field" target="_blank" rel="noreferrer">Download Field Configuration Guide</a>
            )}
          </section>
        )}

        {!loading && isLive && step === 4 && (
          <section className="compare-view" aria-label="Adaptive prioritization">
            {!comparisonsStarted && (
              <div className="project-step">
                <span className="panel-kicker">READY TO COMPARE</span>
                <h2>{selectedFeatures.length} work items from {selectedQuery?.name}</h2>
                <p>The adaptive engine selects the most informative pairs first, converging on a ranking with far fewer comparisons than full pairwise comparison.</p>
                <button className="primary-button" disabled={selectedFeatures.length < 2} onClick={startComparisons}>Start Adaptive Prioritization <span>→</span></button>
              </div>
            )}
            {comparisonsStarted && currentPair && (
              <>
                <div className="compare-meta">
                  <span>COMPARISON {Math.round(comparisonsSoFar) + 1} <i>· ADAPTIVE SELECTION</i></span>
                  <span>{overallConfidence}% confidence</span>
                </div>
                <div className="progress-track"><span style={{ width: `${Math.min(overallConfidence / confidenceThreshold * 100, 100)}%` }} /></div>
                <h2>Which item delivers more business value?</h2>
                <div className="pair-grid">
                  <article className="compare-card">
                    <span className="card-number">A</span>
                    <span className="area-label">{currentPair[0].area}</span>
                    <h3>{currentPair[0].title}</h3>
                    <p>{currentPair[0].description}</p>
                    <strong>{currentPair[0].value}</strong>
                    <button onClick={() => record('a')}>Higher priority <kbd>←</kbd></button>
                  </article>
                  <div className="versus">VS</div>
                  <article className="compare-card alt">
                    <span className="card-number">B</span>
                    <span className="area-label">{currentPair[1].area}</span>
                    <h3>{currentPair[1].title}</h3>
                    <p>{currentPair[1].description}</p>
                    <strong>{currentPair[1].value}</strong>
                    <button onClick={() => record('b')}>Higher priority <kbd>→</kbd></button>
                  </article>
                </div>
                <div className="compare-actions">
                  <button onClick={() => record('equal')}>Equal priority <kbd>↓</kbd></button>
                  <button onClick={() => record('skip')}>Skip <kbd>S</kbd></button>
                </div>
                <p className="keyboard-note">Use the arrow keys to move quickly. Your choices are saved as you go.</p>
              </>
            )}
            {comparisonsStarted && !currentPair && (
              <div className="project-step"><span className="panel-kicker">COMPLETE</span><h2>Adaptive comparisons finished.</h2><p>Confidence reached {overallConfidence}%. Continue to review the ranking.</p></div>
            )}
          </section>
        )}

        {!loading && isLive && step === 5 && (
          <section className="results-layout" aria-label="Review rankings">
            <div className="results-main">
              <div className="result-summary">
                <div>
                  <span className="panel-kicker">ADAPTIVE RANKING</span>
                  <h2>A clear direction is emerging.</h2>
                  <p>Based on {Math.round(comparisonsSoFar)} adaptive comparisons across {selectedFeatures.length} items · {completionPercentage}% complete.</p>
                </div>
                <div className="confidence"><strong>{overallConfidence}%</strong><span>overall confidence</span></div>
              </div>
              {cycles.length > 0 && (
                <div className="cycle-alert">
                  <strong>△ Potential inconsistency detected</strong>
                  <span>Some preferences conflict. Review the comparison history before publishing this result.</span>
                </div>
              )}
              <div className="ranking-list">
                {rankings.map((row) => (
                  <article className="ranking-row" key={row.id}>
                    <span className="rank">{String(row.rank).padStart(2, '0')}</span>
                    <span className="rank-name"><strong>{row.feature?.title ?? row.id}</strong><small>{row.feature?.area} · {row.comparisons} comparisons</small></span>
                    <span className="mini-bar"><i style={{ width: `${Math.max(20, row.confidence)}%` }} /></span>
                    <span className="rating">{row.score}<small>Elo score</small></span>
                    <span className={`confidence-label ${row.confidence > 65 ? 'high' : ''}`}>{row.confidence > 65 ? 'High' : row.confidence > 35 ? 'Med' : 'Low'}</span>
                  </article>
                ))}
              </div>
            </div>
            <aside className="why-panel">
              <span className="panel-kicker">THE WHY</span>
              <h2>Why {topRanking?.feature?.title ?? topRanking?.id} is #1</h2>
              <p>{topRanking?.feature?.title ?? 'This item'} leads because it won the strongest share of its adaptive comparisons and built a {(topRanking?.confidence ?? 0) > 65 ? 'stable' : 'developing'} Elo score.</p>
              <div className="why-metric">
                <span><b>{topRanking?.wins ?? 0}</b> wins</span>
                <span><b>{topRanking?.losses ?? 0}</b> losses</span>
                <span><b>{topRanking?.ties ?? 0}</b> ties</span>
              </div>
            </aside>
          </section>
        )}

        {!loading && isLive && step === 6 && (
          <section className="session-form" aria-label="Synchronize rankings">
            <span className="panel-kicker">SYNCHRONIZATION STATUS</span>
            <h2><span className={`sync-pill sync-${syncStatus.replace(/\s+/g, '-').toLowerCase()}`}>{syncStatus}</span></h2>
            <p>Publishing writes <code>{requiredRankingFields[0].referenceName}</code> and <code>{requiredRankingFields[1].referenceName}</code> to each ranked work item.</p>
            <div className="query-summary">
              <span>Total work items: <b>{rankings.length}</b></span>
              <span>Total comparisons: <b>{Math.round(comparisonsSoFar)}</b></span>
              <span>Completion: <b>{completionPercentage}%</b></span>
              <span>Confidence: <b>{overallConfidence}%</b></span>
            </div>
            {syncError && <div className="error-state" role="alert"><strong>Synchronization failed.</strong><span>{syncError}</span></div>}
            <button className="primary-button" disabled={syncing || rankings.length === 0} onClick={synchronizeRankings}>{syncing ? 'Synchronizing…' : 'Synchronize Rankings to Azure DevOps'} <span>→</span></button>
          </section>
        )}

        {!loading && isLive && (
          <div className="wizard-nav">
            <button className="secondary-button" onClick={goBack} disabled={step === 1}>← Back</button>
            {step < 6
              ? <button className="primary-button" onClick={goNext} disabled={
                  (step === 1 && !selectedQuery) ||
                  (step === 2 && queryResults.length < 2) ||
                  (step === 3 && (!fieldValidations || !fieldsValid)) ||
                  (step === 4 && !(comparisonsStarted && !currentPair))
                }>Next →</button>
              : <button className="primary-button" disabled={syncStatus !== 'Synced'} onClick={finishSession}>Finish ✓</button>}
          </div>
        )}
      </div>
      <footer>
        <span>ADAPTIVE PRIORITIZATION <b>•</b> LOCAL SESSION</span>
        <span>Ranking captures stakeholder preference, not objective truth.</span>
      </footer>
    </main>
  )
}

function filterQueries(nodes: SharedQueryNode[], search: string): SharedQueryNode[] {
  const term = search.trim().toLowerCase()
  if (!term) return nodes
  return nodes.flatMap((node) => {
    const children = filterQueries(node.children ?? [], search)
    return node.name.toLowerCase().includes(term) || node.path.toLowerCase().includes(term) || children.length > 0
      ? [{ ...node, children }]
      : []
  })
}

function findQuery(nodes: SharedQueryNode[], id: string): SharedQueryNode | undefined {
  for (const node of nodes) {
    if (node.id === id && !node.isFolder) return node
    const match = findQuery(node.children ?? [], id)
    if (match) return match
  }
  return undefined
}

function renderQueryNode(node: SharedQueryNode, onSelect: (node: SharedQueryNode) => void): ReactNode {
  return (
    <div className={node.isFolder ? 'query-folder' : 'query-item'} key={node.id}>
      <span>{node.isFolder ? '▾' : '◇'} <b>{node.name}</b><small>{node.path}</small></span>
      {node.isFolder ? <div className="query-children">{(node.children ?? []).map((child) => renderQueryNode(child, onSelect))}</div> : <button onClick={() => onSelect(node)}>Select query</button>}
    </div>
  )
}

export default App
