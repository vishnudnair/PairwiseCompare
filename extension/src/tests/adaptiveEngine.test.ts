import { describe, expect, it } from 'vitest'
import { AdaptiveEloEngine } from '../ranking/adaptiveEngine'
import type { Feature } from '../ranking'

function makeItems(count: number): Feature[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    title: `Item ${index}`,
    area: 'Product',
    state: 'New',
    tags: [],
    description: '',
    value: '',
  }))
}

describe('AdaptiveEloEngine', () => {
  it('updates scores so a consistent winner rises above a consistent loser', () => {
    const engine = new AdaptiveEloEngine()
    const items = makeItems(2)
    engine.initialize(items)
    engine.recordComparison('item-0', 'item-1', 'a')
    const ranking = engine.getRanking()
    expect(ranking[0].id).toBe('item-0')
    expect(ranking[0].score).toBeGreaterThan(1000)
    expect(ranking[1].score).toBeLessThan(1000)
  })

  it('does not change scores or wins/losses on skip', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(2))
    engine.recordComparison('item-0', 'item-1', 'skip')
    const ranking = engine.getRanking()
    expect(ranking.every((row) => row.score === 1000 && row.comparisons === 0)).toBe(true)
  })

  it('selects comparisons between the least-compared items first', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(4))
    const pair = engine.getNextComparison()
    expect(pair).not.toBeNull()
    expect(pair?.[0].id).not.toBe(pair?.[1].id)
  })

  it('avoids repeatedly comparing the same pair beyond the repeat limit', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(2))
    engine.recordComparison('item-0', 'item-1', 'a')
    engine.recordComparison('item-0', 'item-1', 'a')
    expect(engine.getNextComparison()).toBeNull()
  })

  it('increases confidence as comparisons accumulate', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(2))
    const before = engine.getConfidence('item-0')
    engine.recordComparison('item-0', 'item-1', 'a')
    expect(engine.getConfidence('item-0')).toBeGreaterThan(before)
  })

  it('completes once overall confidence reaches the threshold', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(2))
    expect(engine.isComplete(90, 200)).toBe(false)
    for (let i = 0; i < 10; i += 1) engine.recordComparison('item-0', 'item-1', 'a')
    expect(engine.isComplete(1, 200)).toBe(true)
  })

  it('completes once the maximum comparison count is reached regardless of confidence', () => {
    const engine = new AdaptiveEloEngine()
    engine.initialize(makeItems(2))
    engine.recordComparison('item-0', 'item-1', 'equal')
    expect(engine.isComplete(100, 1)).toBe(true)
  })
})
