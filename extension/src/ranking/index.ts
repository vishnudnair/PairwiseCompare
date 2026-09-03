import { applyElo, STARTING_ELO } from './elo'

export type ComparisonResult = 'a' | 'b' | 'tie'

export type Feature = {
  id: string
  title: string
  area: string
  state: string
  tags: string[]
  description: string
  value: string
}

export type Comparison = {
  featureAId: string
  featureBId: string
  result: ComparisonResult
}

export type Ranking = Feature & {
  rating: number
  wins: number
  losses: number
  ties: number
  compared: number
  confidence: number
}

export function calculateRankings(features: Feature[], comparisons: Comparison[]): Ranking[] {
  const ratings = new Map(features.map((feature) => [feature.id, STARTING_ELO]))
  const stats = new Map(features.map((feature) => [feature.id, { wins: 0, losses: 0, ties: 0, compared: 0 }]))

  comparisons.forEach(({ featureAId, featureBId, result }) => {
    const ratingA = ratings.get(featureAId)
    const ratingB = ratings.get(featureBId)
    const statsA = stats.get(featureAId)
    const statsB = stats.get(featureBId)
    if (ratingA === undefined || ratingB === undefined || !statsA || !statsB) return

    const actualA = result === 'a' ? 1 : result === 'b' ? 0 : 0.5
    const [nextA, nextB] = applyElo(ratingA, ratingB, actualA)
    ratings.set(featureAId, nextA)
    ratings.set(featureBId, nextB)
    statsA.compared += 1
    statsB.compared += 1
    if (result === 'a') {
      statsA.wins += 1
      statsB.losses += 1
    } else if (result === 'b') {
      statsB.wins += 1
      statsA.losses += 1
    } else {
      statsA.ties += 1
      statsB.ties += 1
    }
  })

  return features
    .map((feature) => {
      const featureStats = stats.get(feature.id)!
      const rating = ratings.get(feature.id)!
      const coverage = Math.min(featureStats.compared / 5, 1)
      const separation = Math.min(Math.abs(rating - STARTING_ELO) / 100, 1)
      const confidence = Math.round((coverage * 0.65 + separation * 0.35) * 100)
      return { ...feature, ...featureStats, rating: Math.round(rating), confidence }
    })
    .sort((a, b) => b.rating - a.rating)
}

export function detectCycles(features: Feature[], comparisons: Comparison[]): string[][] {
  const graph = new Map<string, string[]>()
  comparisons.forEach(({ featureAId, featureBId, result }) => {
    if (result === 'a') graph.set(featureAId, [...(graph.get(featureAId) ?? []), featureBId])
    if (result === 'b') graph.set(featureBId, [...(graph.get(featureBId) ?? []), featureAId])
  })
  const cycles: string[][] = []
  const featureNames = new Map(features.map((feature) => [feature.id, feature.title]))

  graph.forEach((neighbors, start) => {
    neighbors.forEach((next) => {
      if ((graph.get(next) ?? []).includes(start)) {
        const cycle = [featureNames.get(start)!, featureNames.get(next)!].sort()
        if (!cycles.some((item) => item.join('|') === cycle.join('|'))) cycles.push(cycle)
      }
    })
  })
  return cycles
}
