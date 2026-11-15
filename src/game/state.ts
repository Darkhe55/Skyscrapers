/**
 * 高楼 —— 棋盘状态
 */

import type { GameState, HitTarget, Move, Puzzle } from '../core/types'
import {
  asSkyPuzzle,
  asSkyState,
  decodeCells,
  encodeCells,
  type SkyscraperState,
} from './types'

export function createEmptyState(puzzle: Puzzle): SkyscraperState {
  const p = asSkyPuzzle(puzzle)
  const size = p.width * p.height
  const givens = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    const v = p.givens?.[i] ?? 0
    givens[i] = v >= 1 && v <= p.width ? v : 0
  }
  return {
    puzzleId: p.id,
    width: p.width,
    height: p.height,
    cells: givens.slice(),
    givens,
  }
}

export function cloneState(state: GameState): SkyscraperState {
  const s = asSkyState(state)
  return {
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: s.cells.slice(),
    givens: s.givens.slice(),
  }
}

export function cycleValue(state: GameState, target: HitTarget): number {
  const s = asSkyState(state)
  const given = s.givens[target.index] ?? 0
  if (given !== 0) return given
  const n = s.width
  const v = s.cells[target.index] ?? 0
  return v >= n ? 0 : v + 1
}

export function rightClickValue(state: GameState, target: HitTarget): number {
  const s = asSkyState(state)
  const given = s.givens[target.index] ?? 0
  return given !== 0 ? given : 0
}

export function applyMove(state: GameState, move: Move): void {
  const s = asSkyState(state)
  if (move.index < 0 || move.index >= s.cells.length) return
  if ((s.givens[move.index] ?? 0) !== 0) return
  const n = s.width
  s.cells[move.index] = move.to >= 1 && move.to <= n ? move.to : 0
}

export function invertMove(move: Move): Move {
  return { index: move.index, from: move.to, to: move.from }
}

export function valueAt(state: GameState, index: number): number {
  return asSkyState(state).cells[index] ?? 0
}

export function serializeState(state: GameState): Record<string, unknown> {
  const s = asSkyState(state)
  return {
    version: 1,
    puzzleId: s.puzzleId,
    width: s.width,
    height: s.height,
    cells: encodeCells(s.cells),
  }
}

function readCells(value: unknown, size: number, n: number): number[] | null {
  if (typeof value === 'string') return decodeCells(value, size, n)
  if (Array.isArray(value)) {
    if (value.length !== size) return null
    const out: number[] = []
    for (const v of value) {
      const x = Number(v)
      if (!Number.isInteger(x) || x < 0 || x > n) return null
      out.push(x)
    }
    return out
  }
  return null
}

export function deserializeState(data: Record<string, unknown>): SkyscraperState | null {
  if (typeof data.puzzleId !== 'string') return null
  if (typeof data.width !== 'number' || typeof data.height !== 'number') return null
  const w = data.width
  const h = data.height
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  if (w !== h) return null
  const size = w * h
  const cells = readCells(data.cells, size, w)
  if (!cells) return null
  return {
    puzzleId: data.puzzleId,
    width: w,
    height: h,
    cells,
    givens: new Array<number>(size).fill(0),
  }
}

export function firstHintMove(state: GameState, solution: GameState): Move | null {
  const s = asSkyState(state)
  const sol = asSkyState(solution)
  const size = Math.min(s.cells.length, sol.cells.length)
  for (let i = 0; i < size; i++) {
    if (s.cells[i] === 0 && sol.cells[i] !== 0) {
      return { index: i, from: 0, to: sol.cells[i]! }
    }
  }
  for (let i = 0; i < size; i++) {
    if (s.cells[i] !== sol.cells[i]) {
      return { index: i, from: s.cells[i]!, to: sol.cells[i]! }
    }
  }
  return null
}
