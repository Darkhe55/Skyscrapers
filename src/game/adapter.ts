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
  customMaxW: 9,
  customMaxH: 9,
  targetKind: 'cell' as const,
  interactionHint:
    '<kbd>左键</kbd> 选中格 · <kbd>数字按钮</kbd>/<kbd>1–9</kbd> 填数 · <kbd>N</kbd> 笔记 · <kbd>0</kbd>/<kbd>退格</kbd> 清除 · 题面预填不可改',
}

/** 自定义题板支持的阶数范围（题面编码为 1 字符/格，数字与线索都 ≤9） */
const CUSTOM_MIN_N = 4
const CUSTOM_MAX_N = 9

const VALUE_CYCLE: Array<number | null> = [null, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** 读取一段盘外线索（空格 / 逗号分隔，空 = 0） */
function readSideClues(id: string, n: number): number[] {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  const raw = el?.value.trim() ?? ''
  const vals = raw ? raw.split(/[\s,，]+/).filter(Boolean).map(Number) : []
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(Number.isFinite(vals[i]) ? Math.max(0, Math.min(n, Math.round(vals[i]!))) : 0)
  return out
}

const custom: CustomSupport = {
  mode: 'cell',
  valueCycle: VALUE_CYCLE,
  keyForDigit: (digit) => {
    if (digit === 0) return undefined
    if (digit >= 1 && digit <= 9) return digit
    return undefined
  },
  cellLabel: (v) => (v == null ? '' : String(v)),
  cellClass: (v) => (v == null ? '' : `r${v}`),
  hint:
    `在 n×n 网格里填预填数字（可留空），再在下方录入四条边上的盘外线索（每行 n 个数，0 = 不给线索）。边长 ${CUSTOM_MIN_N}–${CUSTOM_MAX_N}，宽高必须相同。`,

  extras: {
    html: () => `
      <div class="custom-extras-grid">
        <label>上边线索（从左到右，空格或逗号分隔，0 = 无）
          <input id="custom-clue-top" type="text" spellcheck="false" placeholder="如 1 2 3 0 0" />
        </label>
        <label>下边线索（从左到右）
          <input id="custom-clue-bottom" type="text" spellcheck="false" />
        </label>
        <label>左边线索（从上到下）
          <input id="custom-clue-left" type="text" spellcheck="false" />
        </label>
        <label>右边线索（从上到下）
          <input id="custom-clue-right" type="text" spellcheck="false" />
        </label>
        <div class="custom-hint">线索范围 0..n（0 = 不显示）；n 由编辑器宽高决定，宽高必须相同。</div>
      </div>`,
    mount: () => undefined,
    reset: () => {
      for (const id of ['custom-clue-top', 'custom-clue-bottom', 'custom-clue-left', 'custom-clue-right']) {
        const el = document.getElementById(id) as HTMLInputElement | null
        if (el) el.value = ''
      }
    },
    load: (p) => {
      const sp = p as SkyscraperPuzzle
      const set = (id: string, list: number[] | undefined): void => {
        const el = document.getElementById(id) as HTMLInputElement | null
        if (el) el.value = (list ?? []).join(' ')
      }
      set('custom-clue-top', sp.top)
      set('custom-clue-bottom', sp.bottom)
      set('custom-clue-left', sp.left)
      set('custom-clue-right', sp.right)
    },
  },

  toGrid: (p) => {
    const sp = p as SkyscraperPuzzle
    if (!Array.isArray(sp.givens) || sp.givens.length !== p.width * p.height) return null
    return {
      width: p.width,
      height: p.height,
      grid: sp.givens.map((v) => (typeof v === 'number' && v >= 1 ? v : null)),
    }
  },

  makePuzzle: (w, h, grid, existingId) => {
    const n = Math.min(w, h)
    const givens = grid.map((v) =>
      typeof v === 'number' && v >= 1 && v <= 9 ? Math.floor(v) : 0,
    )
    return {
      id: existingId ?? `${meta.customIdPrefix}${w}x${h}-${Date.now()}`,
      name: `自定义 · ${w}×${h}`,
      width: w,
      height: h,
      difficulty: 'custom',
      top: readSideClues('custom-clue-top', n),
      bottom: readSideClues('custom-clue-bottom', n),
      left: readSideClues('custom-clue-left', n),
      right: readSideClues('custom-clue-right', n),
      givens,
    } satisfies SkyscraperPuzzle
  },

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
    if (!Number.isInteger(n) || n < CUSTOM_MIN_N || n > CUSTOM_MAX_N) return null
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

  validatePuzzle: (p) => {
    const sp = p as SkyscraperPuzzle
    const w = p.width
    const h = p.height
    if (w !== h) {
      return { ok: false, message: `高楼是 n×n 拉丁方，宽高必须相同（当前 ${w}×${h}）。`, tone: 'bad' }
    }
    const n = w
    if (n < CUSTOM_MIN_N || n > CUSTOM_MAX_N) {
      return {
        ok: false,
        message: `边长需在 ${CUSTOM_MIN_N}–${CUSTOM_MAX_N} 之间（题面编码为 1 字符/格）。`,
        tone: 'bad',
      }
    }
    const sides: Array<[string, number[] | undefined]> = [
      ['上边', sp.top],
      ['下边', sp.bottom],
      ['左边', sp.left],
      ['右边', sp.right],
    ]
    for (const [label, list] of sides) {
      if (!Array.isArray(list) || list.length !== n) {
        return { ok: false, message: `${label}线索应有 ${n} 个数。`, tone: 'bad' }
      }
      for (const v of list) {
        if (!Number.isInteger(v) || v < 0 || v > n) {
          return { ok: false, message: `${label}线索 ${v} 不合法（应在 0..${n}，0 = 无）。`, tone: 'bad' }
        }
      }
    }
    const givens = sp.givens ?? []
    if (givens.length !== n * n) {
      return { ok: false, message: '预填数字个数与盘面不符。', tone: 'bad' }
    }
    for (let i = 0; i < givens.length; i++) {
      const v = givens[i]!
      if (!Number.isInteger(v) || v < 0 || v > n) {
        return { ok: false, message: `第 ${i + 1} 格的预填数字 ${v} 超出 1..${n}。`, tone: 'bad' }
      }
    }
    // 同一行 / 列的预填数字不能重复（否则一定无解）
    for (let y = 0; y < n; y++) {
      const seen = new Set<number>()
      for (let x = 0; x < n; x++) {
        const v = givens[y * n + x] ?? 0
        if (v <= 0) continue
        if (seen.has(v)) {
          return { ok: false, message: `第 ${y + 1} 行预填数字 ${v} 重复。`, tone: 'bad' }
        }
        seen.add(v)
      }
    }
    for (let x = 0; x < n; x++) {
      const seen = new Set<number>()
      for (let y = 0; y < n; y++) {
        const v = givens[y * n + x] ?? 0
        if (v <= 0) continue
        if (seen.has(v)) {
          return { ok: false, message: `第 ${x + 1} 列预填数字 ${v} 重复。`, tone: 'bad' }
        }
        seen.add(v)
      }
    }
    return { ok: true, message: '结构合法（可在「求解」里进一步验证唯一解）。', tone: 'ok' }
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
