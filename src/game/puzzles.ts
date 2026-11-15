/**
 * 高楼 —— 题库加载
 */

import { RAW_PUZZLES } from './puzzles-data'
import {
  asSkyPuzzle,
  decodeBoard,
  decodeCells,
  type SkyscraperPuzzle,
  type SkyscraperState,
} from './types'

export const builtinPuzzles: SkyscraperPuzzle[] = []
const solutions = new Map<string, number[]>()

for (const raw of RAW_PUZZLES) {
  if (raw.width !== raw.height) {
    console.warn(`[高楼] 非方阵：${raw.id}`)
    continue
  }
  const n = raw.width
  const decoded = decodeBoard(raw.board, n)
  if (!decoded) {
    console.warn(`[高楼] 题面解码失败：${raw.id}`)
    continue
  }
  const puzzle: SkyscraperPuzzle = {
    id: raw.id,
    name: raw.name,
    width: n,
    height: n,
    difficulty: raw.difficulty,
    top: decoded.top,
    bottom: decoded.bottom,
    left: decoded.left,
    right: decoded.right,
    givens: decoded.givens,
  }
  builtinPuzzles.push(puzzle)
  if (raw.solution) {
    const solution = decodeCells(raw.solution, n * n, n)
    if (solution) {
      puzzle.solution = solution
      solutions.set(raw.id, solution)
    }
  }
}

export function getReferenceSolution(id: string): SkyscraperState | null {
  const cells = solutions.get(id)
  if (!cells) return null
  const puzzle = builtinPuzzles.find((p) => p.id === id)
  if (!puzzle) return null
  return {
    puzzleId: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    cells: cells.slice(),
    givens: puzzle.givens.slice(),
  }
}

export function puzzleById(id: string): SkyscraperPuzzle | undefined {
  return builtinPuzzles.find((p) => p.id === id)
}

export function referenceFor(puzzle: SkyscraperPuzzle): number[] | null {
  return asSkyPuzzle(puzzle).solution ?? solutions.get(puzzle.id) ?? null
}
