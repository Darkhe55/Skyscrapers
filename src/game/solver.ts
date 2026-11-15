/**
 * 高楼 —— 回溯求解器
 */

import type { Puzzle, SolveResult } from '../core/types'
import { initialGrid, isValidSolution, propagate, solveByRules } from './rules.ts'
import type { SkyscraperPuzzle, SkyscraperState } from './types.ts'

export interface CountOutcome {
  count: number
  nodes: number
  timedOut: boolean
}

function search(
  givens: number[],
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  limit: number,
  maxNodes: number,
): { solutions: number[][]; nodes: number; timedOut: boolean } {
  const size = n * n
  const grid = initialGrid(givens, size)
  const solutions: number[][] = []
  let nodes = 0
  let timedOut = false

  const dfs = (): void => {
    if (solutions.length >= limit || timedOut) return
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return
    }
    if (!propagate(grid, n, top, bottom, left, right)) return

    let choice = -1
    let best = Infinity
    let bestValues: number[] = []
    for (let i = 0; i < size; i++) {
      if (grid[i] !== 0) continue
      const x = i % n
      const y = (i / n) | 0
      const used = new Set<number>()
      for (let k = 0; k < n; k++) {
        if (grid[y * n + k] !== 0) used.add(grid[y * n + k]!)
        if (grid[k * n + x] !== 0) used.add(grid[k * n + x]!)
      }
      const cands: number[] = []
      for (let v = 1; v <= n; v++) if (!used.has(v)) cands.push(v)
      if (cands.length < best) {
        best = cands.length
        choice = i
        bestValues = cands
      }
    }

    if (choice < 0) {
      if (isValidSolution(grid, n, top, bottom, left, right)) solutions.push(Array.from(grid))
      return
    }

    const backup = Array.from(grid)
    for (const v of bestValues) {
      if (solutions.length >= limit || timedOut) return
      grid[choice] = v
      dfs()
      for (let i = 0; i < size; i++) grid[i] = backup[i]!
    }
  }

  dfs()
  return { solutions, nodes, timedOut }
}

export function countSolutions(
  givens: number[],
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  limit = 2,
  maxNodes = 300_000,
): CountOutcome {
  const out = search(givens, n, top, bottom, left, right, limit, maxNodes)
  return { count: out.solutions.length, nodes: out.nodes, timedOut: out.timedOut }
}

export function solvePuzzle(puzzle: Puzzle, maxNodes = 1_500_000): SolveResult {
  const p = puzzle as SkyscraperPuzzle
  const n = p.width
  if (p.height !== n) return { solved: false, solution: null, nodes: 0, timedOut: false }
  const byRules = solveByRules(p.givens, n, p.top, p.bottom, p.left, p.right, true, 240)
  if (byRules.ok && byRules.solution) {
    return { solved: true, solution: makeState(p, byRules.solution), nodes: 0, timedOut: false }
  }
  if (byRules.contradiction) {
    return { solved: false, solution: null, nodes: 0, timedOut: false }
  }
  const out = search(p.givens, n, p.top, p.bottom, p.left, p.right, 1, maxNodes)
  const solution = out.solutions[0]
  return {
    solved: !!solution,
    solution: solution ? makeState(p, solution) : null,
    nodes: out.nodes,
    timedOut: out.timedOut,
  }
}

export function makeState(puzzle: SkyscraperPuzzle, cells: number[]): SkyscraperState {
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells: cells.slice(),
    givens: puzzle.givens.slice(),
  }
}
