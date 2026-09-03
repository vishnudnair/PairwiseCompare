import { describe, expect, it } from 'vitest'
import { calculateRankings, type Comparison, type Feature } from '../ranking'

const items: Feature[] = [
  { id: 'a', title: 'A', area: 'Product', state: 'New', tags: [], description: '', value: '' },
  { id: 'b', title: 'B', area: 'Product', state: 'New', tags: [], description: '', value: '' },
  { id: 'c', title: 'C', area: 'Product', state: 'New', tags: [], description: '', value: '' },
]

describe('Elo ranking', () => {
  it('ranks a chain of wins in order', () => {
    const comparisons: Comparison[] = [
      { featureAId: 'a', featureBId: 'b', result: 'a' },
      { featureAId: 'b', featureBId: 'c', result: 'a' },
    ]
    expect(calculateRankings(items, comparisons).map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('records ties without declaring a winner', () => {
    const [first, second] = calculateRankings(items.slice(0, 2), [{ featureAId: 'a', featureBId: 'b', result: 'tie' }])
    expect(first.ties).toBe(1)
    expect(second.ties).toBe(1)
    expect(first.rating).toBe(1000)
    expect(second.rating).toBe(1000)
  })

  it('ignores comparisons for unknown work items', () => {
    const rankings = calculateRankings(items, [{ featureAId: 'missing', featureBId: 'a', result: 'a' }])
    expect(rankings.every((item) => item.rating === 1000)).toBe(true)
  })
})
