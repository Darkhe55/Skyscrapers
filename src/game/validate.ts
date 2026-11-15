/**
 * 高楼 —— 实时校验
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'
import { isValidSolution, visibleCount } from './rules'
import {
  asSkyPuzzle,
  asSkyState,
  type ClueIssue,
  type DuplicateIssue,
  type SkyscraperResult,
} from './types'

export function validate(state: GameState, puzzle: Puzzle): SkyscraperResult {
  const s = asSkyState(state)
  const p = asSkyPuzzle(puzzle)
  const n = s.width
  const size = n * n
  const cells = s.cells

  let empty = 0
  const changed = new Set<number>()
  for (let i = 0; i < size; i++) {
    if (cells[i] === 0) empty++
    const given = p.givens?.[i] ?? 0
    if (given !== 0 && cells[i] !== given) changed.add(i)
  }

  const bad = new Set<number>()
  for (const i of changed) bad.add(i)
  const duplicateIssues: DuplicateIssue[] = []

  for (let y = 0; y < n; y++) {
    const map = new Map<number, number[]>()
    for (let x = 0; x < n; x++) {
      const v = cells[y * n + x]!
      if (v === 0) continue
      const list = map.get(v) ?? []
      list.push(y * n + x)
      map.set(v, list)
    }
    for (const [value, list] of map) {
      if (list.length > 1) {
        duplicateIssues.push({ orientation: 'row', index: y, value, cells: list })
        for (const i of list) bad.add(i)
      }
    }
  }
  for (let x = 0; x < n; x++) {
    const map = new Map<number, number[]>()
    for (let y = 0; y < n; y++) {
      const v = cells[y * n + x]!
      if (v === 0) continue
      const list = map.get(v) ?? []
      list.push(y * n + x)
      map.set(v, list)
    }
    for (const [value, list] of map) {
      if (list.length > 1) {
        duplicateIssues.push({ orientation: 'col', index: x, value, cells: list })
        for (const i of list) bad.add(i)
      }
    }
  }

  const clueIssues: ClueIssue[] = []
  const complete = empty === 0

  const checkLine = (
    indices: number[],
    side: 'top' | 'bottom' | 'left' | 'right',
    index: number,
    target: number,
  ): void => {
    if (target <= 0) return
    const line = indices.map((i) => cells[i]!)
    if (line.some((v) => v === 0)) return
    const actual = visibleCount(side === 'right' || side === 'bottom' ? line.slice().reverse() : line)
    if (actual !== target) {
      clueIssues.push({ side, index, actual, target })
      for (const i of indices) bad.add(i)
    }
  }

  for (let x = 0; x < n; x++) {
    const col: number[] = []
    for (let y = 0; y < n; y++) col.push(y * n + x)
    checkLine(col, 'top', x, p.top[x] ?? 0)
    checkLine(col, 'bottom', x, p.bottom[x] ?? 0)
  }
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) row.push(y * n + x)
    checkLine(row, 'left', y, p.left[y] ?? 0)
    checkLine(row, 'right', y, p.right[y] ?? 0)
  }

  const solved =
    complete &&
    duplicateIssues.length === 0 &&
    clueIssues.length === 0 &&
    changed.size === 0 &&
    isValidSolution(cells, n, p.top ?? [], p.bottom ?? [], p.left ?? [], p.right ?? [])

  return {
    solved,
    empty,
    complete,
    duplicateIssues,
    clueIssues,
    changedGivens: Array.from(changed),
    badCells: Array.from(bad),
  }
}

export function statusBits(result: ValidationResult): string[] {
  const r = result as SkyscraperResult
  if (r.solved) return ['完成']
  const bits: string[] = []
  if (typeof r.empty === 'number' && r.empty > 0) bits.push(`还需填 ${r.empty} 格`)
  if (r.duplicateIssues.length > 0) bits.push(`${r.duplicateIssues.length} 处行列重复`)
  if (r.clueIssues.length > 0) bits.push(`${r.clueIssues.length} 条盘外数字不满足`)
  if (r.changedGivens.length > 0) bits.push('题面预填数字被改动')
  if (bits.length === 0) bits.push('继续填楼')
  return bits
}
