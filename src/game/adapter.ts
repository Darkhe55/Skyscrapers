/**
 * ════════════════════════════════════════════════════════════════════
 *  高楼（Skyscrapers）—— 游戏适配器
 * ════════════════════════════════════════════════════════════════════
 *
 * 状态：0 = 未填，1..n = 楼高。
 */

import { playDrop, playPluck } from '../core/audio'
import type { CustomSupport, GameAdapter, Move, Puzzle, SolveResult } from '../core/types'
import { planLogicSolve } from './logic'
import { builtinPuzzles, getReferenceSolution } from './puzzles'
import { hitTest, metricsFor, renderBoard } from './render'
import { solvePuzzle } from './solver'
import {
  applyMove,
  cloneState,
  createEmptyState,
  cycleValue,
  deserializeState,
  firstHintMove,
  invertMove,
  rightClickValue,
  serializeState,
  valueAt,
} from './state'
import { statusBits, validate } from './validate'
import { decodeBoard, encodeBoard, type SkyscraperPuzzle } from './types'

const meta = {
  title: '高楼',
  tagline: '每行每列填入 1..n —— 盘外数字是从那个方向能看到的楼数',
  footerNote:
    '规则：在 n×n 格中填入 1..n，每行每列数字不重复；盘外数字表示从该方向看去能看到的高楼栋数（高楼挡住矮楼）。',
  storageKeyPrefix: 'skyscrapers',
  customIdPrefix: 'skyscrapers-custom-',
  customMinW: 4,
  customMinH: 4,
  customMaxW: 8,
  customMaxH: 8,
  targetKind: 'cell' as const,
}

const VALUE_CYCLE: Array<number | null> = [null, 1, 2, 3, 4, 5, 6, 7, 8]

const custom: CustomSupport = {
  mode: 'none',
  valueCycle: VALUE_CYCLE,
  keyForDigit: (digit) => {
    if (digit === 0) return null
    if (digit >= 1 && digit <= 8) return digit
    return undefined
  },
  cellLabel: (v) => (v == null ? '' : String(v)),
  cellClass: (v) => (v == null ? '' : `r${v}`),
  hint: '本游戏暂不支持自定义题板。',
  makePuzzle: (w, h, _grid, existingId) => ({
    id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
    name: `自定义 · ${w}×${h}`,
    width: w,
    height: h,
    difficulty: 'custom',
    top: new Array<number>(w).fill(0),
    bottom: new Array<number>(w).fill(0),
    left: new Array<number>(h).fill(0),
    right: new Array<number>(h).fill(0),
    givens: new Array<number>(w * h).fill(0),
  }),
  encodePuzzle: (p) => {
    const sp = p as SkyscraperPuzzle
    return {
      board: encodeBoard(sp.givens ?? [], sp.top ?? [], sp.bottom ?? [], sp.left ?? [], sp.right ?? []),
    }
  },
  decodePuzzle: (record) => {
    if (typeof record.id !== 'string') return null
    if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
    if (record.width !== record.height) return null
    const n = record.width
    if (typeof record.board !== 'string') return null
    const decoded = decodeBoard(record.board, n)
    if (!decoded) return null
    return {
      id: record.id,
      name: typeof record.name === 'string' ? record.name : `自定义 · ${n}×${n}`,
      width: n,
      height: n,
      difficulty: 'custom',
      top: decoded.top,
      bottom: decoded.bottom,
      left: decoded.left,
      right: decoded.right,
      givens: decoded.givens,
    } satisfies SkyscraperPuzzle
  },
}

function playForMove(move: Move, streak: number): void {
  if (move.from === 0) playPluck(streak, 1.1)
  else playDrop(streak)
}

export const adapter: GameAdapter = {
  meta,
  builtinPuzzles,
  getReferenceSolution,
  createEmptyState,
  cloneState,
  cycleValue,
  rightClickValue,
  applyMove,
  invertMove,
  valueAt,
  serializeState,
  deserializeState,
  validate,
  statusBits,
  metricsFor,
  renderBoard,
  hitTest,
  planLogicSolve,
  solvePuzzle: (puzzle: Puzzle, maxNodes?: number): SolveResult => solvePuzzle(puzzle, maxNodes),
  firstHintMove,
  custom,
  playForMove,
}
