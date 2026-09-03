export const STARTING_ELO = 1000
export const K_FACTOR = 32

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

/** Returns the [new ratingA, new ratingB] pair after a single comparison. actualA is 1 (A wins), 0 (B wins), or 0.5 (tie). */
export function applyElo(ratingA: number, ratingB: number, actualA: number): [number, number] {
  const change = K_FACTOR * (actualA - expectedScore(ratingA, ratingB))
  return [ratingA + change, ratingB - change]
}
