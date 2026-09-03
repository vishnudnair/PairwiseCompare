import { applyElo, STARTING_ELO } from './elo'
import type { Feature } from './index'

export type AdaptiveResult = 'a' | 'b' | 'equal' | 'skip'
export type AdaptivePair = readonly [Feature, Feature]

export type AdaptiveRankingRow = {
  id: string
  score: number
  comparisons: number
  wins: number
  losses: number
  ties: number
  confidence: number
  rank: number
}

type ItemState = { score: number; comparisons: number; wins: number; losses: number; ties: number }

/** Minimum comparisons before an item's confidence can approach the completion threshold. */
const TARGET_COMPARISONS = 6
/** Comparisons per pair beyond which the pair stops being useful (already well-differentiated or overexplored). */
const MAX_REPEATS_PER_PAIR = 2

/**
 * Adaptive Elo ranking engine. Instead of exhaustive pairwise comparison (N*(N-1)/2), it selects the
 * next comparison between items with similar scores and the highest remaining ranking uncertainty,
 * which converges on a stable ranking with far fewer comparisons.
 */
export class AdaptiveEloEngine {
  private readonly states = new Map<string, ItemState>()
  private readonly items = new Map<string, Feature>()
  private readonly pairCounts = new Map<string, number>()
  private historyLength = 0

  initialize(items: Feature[]): void {
    this.items.clear()
    this.states.clear()
    this.pairCounts.clear()
    this.historyLength = 0
    items.forEach((item) => {
      this.items.set(item.id, item)
      this.states.set(item.id, { score: STARTING_ELO, comparisons: 0, wins: 0, losses: 0, ties: 0 })
    })
  }

  private pairKey(aId: string, bId: string): string {
    return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`
  }

  /** Selects the pair with the closest scores among the least-compared, least-repeated candidates. */
  getNextComparison(): AdaptivePair | null {
    const ids = [...this.items.keys()]
    if (ids.length < 2) return null

    const candidates: { aId: string; bId: string; scoreGap: number; uncertainty: number }[] = []
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const aId = ids[i]
        const bId = ids[j]
        const repeats = this.pairCounts.get(this.pairKey(aId, bId)) ?? 0
        if (repeats >= MAX_REPEATS_PER_PAIR) continue
        const stateA = this.states.get(aId)!
        const stateB = this.states.get(bId)!
        const scoreGap = Math.abs(stateA.score - stateB.score)
        const uncertainty = Math.max(0, TARGET_COMPARISONS - Math.min(stateA.comparisons, stateB.comparisons))
        candidates.push({ aId, bId, scoreGap, uncertainty })
      }
    }
    if (candidates.length === 0) return null

    candidates.sort((left, right) => right.uncertainty - left.uncertainty || left.scoreGap - right.scoreGap)
    const best = candidates[0]
    return [this.items.get(best.aId)!, this.items.get(best.bId)!]
  }

  recordComparison(itemAId: string, itemBId: string, result: AdaptiveResult): void {
    const stateA = this.states.get(itemAId)
    const stateB = this.states.get(itemBId)
    if (!stateA || !stateB) return
    this.historyLength += 1
    if (result === 'skip') return

    const actualA = result === 'a' ? 1 : result === 'b' ? 0 : 0.5
    const [nextA, nextB] = applyElo(stateA.score, stateB.score, actualA)
    stateA.score = nextA
    stateB.score = nextB
    stateA.comparisons += 1
    stateB.comparisons += 1
    if (result === 'a') {
      stateA.wins += 1
      stateB.losses += 1
    } else if (result === 'b') {
      stateB.wins += 1
      stateA.losses += 1
    } else {
      stateA.ties += 1
      stateB.ties += 1
    }
    const key = this.pairKey(itemAId, itemBId)
    this.pairCounts.set(key, (this.pairCounts.get(key) ?? 0) + 1)
  }

  /** Confidence reflects how close an item is to its target comparison coverage and how differentiated its score is. */
  getConfidence(itemId: string): number {
    const state = this.states.get(itemId)
    if (!state) return 0
    const coverage = Math.min(state.comparisons / TARGET_COMPARISONS, 1)
    const separation = Math.min(Math.abs(state.score - STARTING_ELO) / 150, 1)
    return Math.round((coverage * 0.7 + separation * 0.3) * 100)
  }

  getRanking(): AdaptiveRankingRow[] {
    return [...this.states.entries()]
      .map(([id, state]) => ({
        id,
        score: Math.round(state.score),
        comparisons: state.comparisons,
        wins: state.wins,
        losses: state.losses,
        ties: state.ties,
        confidence: this.getConfidence(id),
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((row, index) => ({ ...row, rank: index + 1 }))
  }

  /** Overall confidence, averaged across all items. */
  getOverallConfidence(): number {
    const ids = [...this.items.keys()]
    if (ids.length === 0) return 0
    return Math.round(ids.reduce((sum, id) => sum + this.getConfidence(id), 0) / ids.length)
  }

  isComplete(confidenceThreshold = 90, maxComparisons = 200): boolean {
    if (this.historyLength >= maxComparisons) return true
    if (this.items.size < 2) return true
    return this.getOverallConfidence() >= confidenceThreshold
  }
}
