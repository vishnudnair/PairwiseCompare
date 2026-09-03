import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { detectCycles, type Comparison, type Feature } from './ranking'
import { AdaptiveEloEngine, type AdaptivePair, type AdaptiveResult } from './ranking/adaptiveEngine'
import { loadAzureContext } from './services/azureContext'
import { AzureDevOpsSharedQueryService } from './services/sharedQueryService'
import { defaultSessionConfiguration, type SharedQueryNode } from './models/domain'

const demoFeatures: Feature[] = [
  { id: 'payments', title: 'Payment gateway', area: 'Commerce', state: 'New', tags: ['revenue', 'Q4'], description: 'Accept cards, wallets, and local payment methods in one checkout flow.', value: 'Business value 80' },
  { id: 'mobile', title: 'Mobile application', area: 'Experience', state: 'New', tags: ['customer', 'Q1'], description: 'A focused mobile experience for customers managing their account on the go.', value: 'Business value 65' },
  { id: 'auth', title: 'Single sign-on', area: 'Platform', state: 'Approved', tags: ['security', 'Q4'], description: 'Let enterprise customers authenticate with their existing identity provider.', value: 'Business value 55' },
  { id: 'reporting', title: 'Reporting dashboard', area: 'Insights', state: 'New', tags: ['analytics'], description: 'Give teams a clear view of usage, outcomes, and operational health.', value: 'Business value 40' },
  { id: 'notifications', title: 'Smart notifications', area: 'Experience', state: 'New', tags: ['retention'], description: 'Send timely, actionable alerts that help users stay ahead of changes.', value: 'Business value 35' },
  { id: 'export', title: 'Excel export', area: 'Insights', state: 'New', tags: ['analytics', 'Q1'], description: 'Export filtered results for offline analysis and stakeholder sharing.', value: 'Business value 25' },
]

type View = 'select' | 'compare' | 'results'

function App() {
  const [availableFeatures, setAvailableFeatures] = useState<Feature[]>(demoFeatures)
  const [projectId, setProjectId] = useState('local')
  const [projectName, setProjectName] = useState('Local prototype')
  const [isLive, setIsLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sharedQueries, setSharedQueries] = useState<SharedQueryNode[]>([])
  const [queryLoading, setQueryLoading] = useState(false)

  const [view, setView] = useState<View>('select')
  const [searchText, setSearchText] = useState('')
  const [area, setArea] = useState('All areas')
  const [selected, setSelected] = useState<string[]>(['payments', 'mobile', 'auth', 'reporting'])
  const [comparisonLog, setComparisonLog] = useState<Comparison[]>([])
  const [currentPair, setCurrentPair] = useState<AdaptivePair | null>(null)
  const [saved, setSaved] = useState(false)

  const engine = useRef(new AdaptiveEloEngine())
  const confidenceThreshold = defaultSessionConfiguration.confidenceThreshold
  const maxComparisons = defaultSessionConfiguration.maxComparisons

  useEffect(() => {
    loadAzureContext(demoFeatures).then((context) => {
      setAvailableFeatures(context.features)
      setProjectId(context.projectId)
      setProjectName(context.projectName)
      setIsLive(context.isLive)
      setSelected(context.features.slice(0, 4).map((feature) => feature.id))
      setLoading(false)
      if (context.isLive) {
        setQueryLoading(true)
        new AzureDevOpsSharedQueryService()
          .listQueries(context.projectId)
          .then(setSharedQueries)
          .catch(() => setSharedQueries([]))
          .finally(() => setQueryLoading(false))
      }
    })
  }, [])

  const visibleFeatures = availableFeatures.filter((feature) =>
    (area === 'All areas' || feature.area === area) &&
    `${feature.title} ${feature.description} ${feature.tags.join(' ')}`.toLowerCase().includes(searchText.toLowerCase()),
  )
  const selectedFeatures = availableFeatures.filter((feature) => selected.includes(feature.id))
  const featureById = useMemo(() => new Map(availableFeatures.map((feature) => [feature.id, feature])), [availableFeatures])
  const rankings = useMemo(() => engine.current.getRanking().map((row) => ({ ...row, feature: featureById.get(row.id) })), [comparisonLog, featureById])
  const cycles = useMemo(() => detectCycles(selectedFeatures, comparisonLog), [selectedFeatures, comparisonLog])
  const overallConfidence = engine.current.getOverallConfidence()

  useEffect(() => {
    window.localStorage.setItem('adaptive-prioritization.session.v1', JSON.stringify({ selected, comparisonLog, savedAt: saved ? new Date().toISOString() : null }))
  }, [selected, comparisonLog, saved])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (view !== 'compare' || !currentPair) return
      if (event.key === 'ArrowLeft') record('a')
      if (event.key === 'ArrowRight') record('b')
      if (event.key.toLowerCase() === 'e' || event.key === 'ArrowDown') record('equal')
      if (event.key.toLowerCase() === 's') record('skip')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function toggleFeature(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  function applySharedQuery(queryId: string) {
    if (!queryId) return
    setQueryLoading(true)
    new AzureDevOpsSharedQueryService()
      .runQuery(projectId, queryId)
      .then((items) => {
        const features = items.map((item): Feature => ({
          id: String(item.id),
          title: item.title,
          area: item.areaPath.split('\\').at(-1) ?? item.areaPath,
          state: item.state,
          tags: item.tags,
          description: item.description ?? 'No description provided.',
          value: item.businessValue === undefined ? 'Business value not set' : `Business value ${item.businessValue}`,
        }))
        setAvailableFeatures(features)
        setSelected(features.slice(0, 4).map((feature) => feature.id))
      })
      .finally(() => setQueryLoading(false))
  }

  function record(result: AdaptiveResult) {
    if (!currentPair) return
    const [featureA, featureB] = currentPair
    engine.current.recordComparison(featureA.id, featureB.id, result)
    if (result !== 'skip') {
      setComparisonLog((current) => [...current, { featureAId: featureA.id, featureBId: featureB.id, result: result === 'equal' ? 'tie' : result }])
    }
    if (engine.current.isComplete(confidenceThreshold, maxComparisons)) {
      setView('results')
      return
    }
    setCurrentPair(engine.current.getNextComparison())
  }

  function start() {
    engine.current.initialize(selectedFeatures)
    setComparisonLog([])
    setCurrentPair(engine.current.getNextComparison())
    setView('compare')
  }

  const comparisonsSoFar = engine.current.getRanking().reduce((sum, row) => sum + row.comparisons, 0) / 2
  const topRanking = rankings[0]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">A</div>
        <div><strong>Adaptive Prioritization</strong><span>Boards work item ranking</span></div>
        <div className="project-pill"><span className="status-dot" /> {projectName} <b>⌄</b></div>
        <button className="icon-button" aria-label="Open settings">⚙</button>
      </header>
      <div className="content">
        <div className="eyebrow">
          Azure Boards <span>/</span> {projectName} {isLive && <em className="live-label">LIVE</em>}
        </div>
        <div className="title-row">
          <div>
            <h1>{view === 'select' ? 'Choose your work items' : view === 'compare' ? 'Which delivers more value?' : 'Your adaptive ranking'}</h1>
            <p>
              {view === 'select' && 'Select a Shared Query or filter items manually, then let the adaptive engine pick the most useful comparisons.'}
              {view === 'compare' && 'The engine compares items with similar scores first, so far fewer decisions are needed than full pairwise comparison.'}
              {view === 'results' && 'A transparent, confidence-scored ranking built from adaptive Elo comparisons.'}
            </p>
          </div>
          <div className="session-status">
            <span className="live-dot" /> Session {saved ? 'saved' : 'in progress'}
            <button onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save session'}</button>
          </div>
        </div>

        {loading && <div className="loading-state">Connecting to Azure Boards<span>...</span></div>}

        {!loading && view === 'select' && (
          <section className="selection-layout">
            <div className="main-panel">
              {isLive && (
                <div className="query-picker">
                  <span className="panel-kicker">SHARED QUERY</span>
                  <select disabled={queryLoading} defaultValue="" onChange={(event) => applySharedQuery(event.target.value)}>
                    <option value="">{queryLoading ? 'Loading shared queries…' : 'Use default work item import'}</option>
                    {flattenQueries(sharedQueries).map((node) => (
                      <option key={node.id} value={node.id}>{node.path}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="toolbar">
                <label className="search">
                  <span>⌕</span>
                  <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search work items" />
                </label>
                <select value={area} onChange={(event) => setArea(event.target.value)}>
                  <option>All areas</option>
                  {[...new Set(availableFeatures.map((feature) => feature.area))].map((value) => <option key={value}>{value}</option>)}
                </select>
                <button className="text-button" onClick={() => setSelected(visibleFeatures.map((feature) => feature.id))}>Select visible</button>
              </div>
              <div className="list-heading"><span>WORK ITEMS <small>{visibleFeatures.length}</small></span><span>{selected.length} selected</span></div>
              <div className="feature-list">
                {visibleFeatures.map((feature) => (
                  <button className={`feature-row ${selected.includes(feature.id) ? 'is-selected' : ''}`} key={feature.id} onClick={() => toggleFeature(feature.id)}>
                    <span className="checkbox">{selected.includes(feature.id) ? '✓' : ''}</span>
                    <span className="feature-copy"><strong>{feature.title}</strong><small>{feature.state} · {feature.description}</small></span>
                    <span className="tag-list">{feature.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
                    <span className="row-arrow">›</span>
                  </button>
                ))}
              </div>
            </div>
            <aside className="setup-panel">
              <span className="panel-kicker">SESSION SETUP</span>
              <h2>Ready when you are.</h2>
              <p>The adaptive engine avoids exhaustive pairwise comparison by focusing on items with similar scores and the highest ranking uncertainty.</p>
              <div className="setup-stat"><strong>{selected.length}</strong><span>items selected</span></div>
              <div className="setup-stat"><strong>{confidenceThreshold}%</strong><span>completion confidence target</span></div>
              <div className="progress-line"><span style={{ width: `${Math.min(selected.length / Math.max(availableFeatures.length, 1) * 100, 100)}%` }} /></div>
              <button className="primary-button" disabled={selected.length < 2} onClick={start}>Start prioritization <span>→</span></button>
              {selected.length < 2 && <small className="warning">Select at least two work items to begin.</small>}
            </aside>
          </section>
        )}

        {view === 'compare' && currentPair && (
          <section className="compare-view">
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
          </section>
        )}

        {view === 'results' && (
          <section className="results-layout">
            <div className="results-main">
              <div className="result-summary">
                <div>
                  <span className="panel-kicker">ADAPTIVE RANKING</span>
                  <h2>A clear direction is emerging.</h2>
                  <p>Based on {Math.round(comparisonsSoFar)} adaptive comparisons across {selected.length} items.</p>
                </div>
                <div className="confidence"><strong>{overallConfidence}%</strong><span>overall confidence</span></div>
              </div>
              {cycles.length > 0 && (
                <div className="cycle-alert">
                  <strong>△ Potential inconsistency detected</strong>
                  <span>Some preferences conflict. Review the comparison history before sharing this result.</span>
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
              <button className="secondary-button" onClick={() => setView('compare')}>Review comparisons <span>→</span></button>
              <button className="primary-button" onClick={() => setSaved(true)}>Save final ranking <span>✓</span></button>
            </aside>
          </section>
        )}
      </div>
      <footer>
        <span>ADAPTIVE PRIORITIZATION <b>•</b> LOCAL SESSION</span>
        <span>Ranking captures stakeholder preference, not objective truth.</span>
      </footer>
    </main>
  )
}

function flattenQueries(nodes: SharedQueryNode[]): SharedQueryNode[] {
  return nodes.flatMap((node) => (node.isFolder ? flattenQueries(node.children ?? []) : [node]))
}

export default App
