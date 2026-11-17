/**
 * 高楼 —— 逻辑解题回放计划
 */

import type { GameState, LogicPlan, PlaybackFrame, Puzzle } from '../core/types'
import { isValidSolution, propagate, type RuleKind } from './rules'
import {
  asSkyPuzzle,
  asSkyState,
  type SkyscraperState,
} from './types'

const RULE_INFO: Record<RuleKind | 'probe' | 'search', { rule: number; label: string }> = {
  clue: { rule: 1, label: '盘外线索极值：1 = 紧邻最高楼，n = 单调递增' },
  visible: { rule: 2, label: '可见性排列交叉消除：候选被两侧线索唯一确定' },
  latin: { rule: 3, label: '拉丁方：行/列唯一候选或隐藏单值' },
  subset: { rule: 4, label: '候选数对/三元组：行/列内交叉消除' },
  bound: { rule: 5, label: '可见高度上下界：排除无法凑出该侧线索的取值' },
  probe: { rule: 6, label: '反证：其他数字会立刻矛盾' },
  search: { rule: 7, label: '回溯试探：该格最终是这个数字' },
}

function fallbackSolve(
  grid: number[],
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  maxNodes: number,
): number[] | null {
  const size = n * n
  let nodes = 0
  let timedOut = false
  const work = grid.slice()
  const dfs = (): number[] | null => {
    if (timedOut) return null
    nodes++
    if (nodes > maxNodes) {
      timedOut = true
      return null
    }
    if (!propagate(work, n, top, bottom, left, right)) return null
    let choice = -1
    for (let i = 0; i < size; i++) {
      if (work[i] === 0) {
        choice = i
        break
      }
    }
    if (choice < 0) {
      return isValidSolution(work, n, top, bottom, left, right) ? Array.from(work) : null
    }
    const backup = work.slice()
    for (let v = 1; v <= n; v++) {
      work[choice] = v
      const found = dfs()
      if (found) return found
      for (let i = 0; i < size; i++) work[i] = backup[i]!
      if (timedOut) return null
    }
    return null
  }
  return dfs()
}

export function planLogicSolve(puzzle: Puzzle, initialState: GameState): LogicPlan {
  const p = asSkyPuzzle(puzzle)
  const s = asSkyState(initialState)
  const n = s.width
  const size = n * n
  const top = p.top ?? []
  const bottom = p.bottom ?? []
  const left = p.left ?? []
  const right = p.right ?? []

  const emptyPlan: LogicPlan = {
    puzzleId: p.id,
    frames: [],
    finalState: null,
    ruleSteps: 0,
    saturated: false,
  }

  const grid = s.cells.slice()
  const displayed = s.cells.slice()
  const frames: PlaybackFrame[] = []
  let lastKind = ''
  let streak = 0
  const emit = (index: number, to: number, kind: RuleKind | 'probe' | 'search'): void => {
    const from = displayed[index] ?? 0
    if (from === to) return
    displayed[index] = to
    if (kind === lastKind) streak++
    else {
      lastKind = kind
      streak = 1
    }
    frames.push({ rule: RULE_INFO[kind].rule, label: RULE_INFO[kind].label, move: { index, from, to }, streak })
  }
  const onSet = (index: number, value: number, kind: RuleKind): void => emit(index, value, kind)

  if (!propagate(grid, n, top, bottom, left, right, onSet)) return emptyPlan

  let saturated = true
  for (let round = 0; round < size * 2; round++) {
    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === 0) {
        unknown = i
        break
      }
    }
    if (unknown < 0) break
    if (frames.length > 8000) {
      saturated = false
      break
    }
    const forced: Array<{ index: number; value: number }> = []
    for (let i = 0; i < size; i++) {
      if (grid[i] !== 0) continue
      const feasible: number[] = []
      for (let v = 1; v <= n; v++) {
        const trial = grid.slice()
        trial[i] = v
        if (propagate(trial, n, top, bottom, left, right)) feasible.push(v)
      }
      if (feasible.length === 0) return emptyPlan
      if (feasible.length === 1) forced.push({ index: i, value: feasible[0]! })
    }
    if (!forced.length) {
      saturated = false
      break
    }
    for (const { index, value } of forced) {
      if (grid[index] === 0) {
        grid[index] = value
        emit(index, value, 'probe')
      }
    }
    if (!propagate(grid, n, top, bottom, left, right, onSet)) return emptyPlan
  }

  let stillUnknown = false
  for (let i = 0; i < size; i++) {
    if (grid[i] === 0) {
      stillUnknown = true
      break
    }
  }
  if (stillUnknown) {
    const found = fallbackSolve(grid, n, top, bottom, left, right, 1_000_000)
    if (!found) return emptyPlan
    for (let i = 0; i < size; i++) {
      if (grid[i] === found[i]) continue
      grid[i] = found[i]!
      emit(i, found[i]!, 'search')
    }
    saturated = false
  }

  const finalState: SkyscraperState = {
    puzzleId: s.puzzleId,
    width: n,
    height: n,
    cells: Array.from(grid),
    givens: s.givens.slice(),
  }
  return { puzzleId: p.id, frames, finalState, ruleSteps: frames.length, saturated }
}
