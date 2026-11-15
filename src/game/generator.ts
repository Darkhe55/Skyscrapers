/**
 * 高楼题库生成器
 *
 * 1. 用循环拉丁方 + 随机置换行/列/数字构造终盘；
 * 2. 计算四个方向的可见高楼数；
 * 3. 用拉丁方传播 + 回溯验证唯一解。
 */

import type { Difficulty } from '../core/types'
import { encodeBoard, encodeCells } from './types.ts'
import { solveByRules, visibleCount } from './rules.ts'
import { countSolutions } from './solver.ts'

export interface RawPuzzleOut {
  id: string
  name: string
  width: number
  height: number
  difficulty: Difficulty
  series: string
  board: string
  solution: string
}

interface GenSpec {
  n: number
  seed: number
  difficulty: Difficulty
  name: string
  series: string
  attempts: number
  maxNodes: number
  requireLogic: boolean
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = list[i]!
    list[i] = list[j]!
    list[j] = tmp
  }
  return list
}

function makeLatin(n: number, rng: () => number): number[] {
  const rowOrder = shuffle(Array.from({ length: n }, (_, i) => i), rng)
  const colOrder = shuffle(Array.from({ length: n }, (_, i) => i), rng)
  const symbols = shuffle(Array.from({ length: n }, (_, i) => i + 1), rng)
  const cells = new Array<number>(n * n).fill(0)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const raw = (colOrder[x]! + rowOrder[y]!) % n
      cells[y * n + x] = symbols[raw]!
    }
  }
  return cells
}

interface AttemptStats {
  notUnique: number
  timeout: number
}

function attemptPuzzle(
  spec: GenSpec,
  rng: () => number,
  stats: AttemptStats,
): {
  top: number[]
  bottom: number[]
  left: number[]
  right: number[]
  givens: number[]
  solution: number[]
} | null {
  const n = spec.n
  const solution = makeLatin(n, rng)

  const top = new Array<number>(n).fill(0)
  const bottom = new Array<number>(n).fill(0)
  const left = new Array<number>(n).fill(0)
  const right = new Array<number>(n).fill(0)
  for (let x = 0; x < n; x++) {
    const col: number[] = []
    for (let y = 0; y < n; y++) col.push(solution[y * n + x]!)
    top[x] = visibleCount(col)
    bottom[x] = visibleCount(col.slice().reverse())
  }
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) row.push(solution[y * n + x]!)
    left[y] = visibleCount(row)
    right[y] = visibleCount(row.slice().reverse())
  }

  const order = shuffle(
    Array.from({ length: n * n }, (_, i) => i),
    rng,
  )
  const applyPrefix = (count: number): number[] => {
    const givens = new Array<number>(n * n).fill(0)
    for (let i = 0; i < count; i++) {
      const idx = order[i]!
      givens[idx] = solution[idx]!
    }
    return givens
  }
  const isUnique = (givens: number[]): boolean | null => {
    const out = countSolutions(givens, n, top, bottom, left, right, 2, spec.maxNodes)
    if (out.timedOut) return null
    return out.count === 1
  }

  let lo = 0
  let hi = n * n
  const fullUnique = isUnique(applyPrefix(hi))
  if (fullUnique === null) {
    stats.timeout++
    return null
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const unique = isUnique(applyPrefix(mid))
    if (unique === null) {
      stats.timeout++
      return null
    }
    if (unique) hi = mid
    else lo = mid + 1
  }
  const givens = applyPrefix(lo)
  if (spec.requireLogic) {
    solveByRules(givens, n, top, bottom, left, right, true, 240)
  }
  return { top, bottom, left, right, givens, solution }
}

const SPECS: GenSpec[] = [
  {
    n: 4,
    seed: 0x534b5901,
    difficulty: 'easy',
    name: '初识高楼',
    series: '入门',
    attempts: 200,
    maxNodes: 40_000,
    requireLogic: true,
  },
  {
    n: 5,
    seed: 0x534b5902,
    difficulty: 'easy',
    name: '五街天际',
    series: '入门',
    attempts: 300,
    maxNodes: 80_000,
    requireLogic: true,
  },
  {
    n: 5,
    seed: 0x534b5903,
    difficulty: 'medium',
    name: '楼影回廊',
    series: '进阶',
    attempts: 400,
    maxNodes: 100_000,
    requireLogic: true,
  },
  {
    n: 6,
    seed: 0x534b5904,
    difficulty: 'medium',
    name: '六城视界',
    series: '进阶',
    attempts: 500,
    maxNodes: 150_000,
    requireLogic: false,
  },
  {
    n: 6,
    seed: 0x534b5905,
    difficulty: 'hard',
    name: '高楼迷阵',
    series: '挑战',
    attempts: 600,
    maxNodes: 180_000,
    requireLogic: false,
  },
  {
    n: 6,
    seed: 0x534b5906,
    difficulty: 'hard',
    name: '天际终局',
    series: '挑战',
    attempts: 700,
    maxNodes: 200_000,
    requireLogic: false,
  },
]

export function generatePuzzles(): RawPuzzleOut[] {
  const out: RawPuzzleOut[] = []
  for (const spec of SPECS) {
    const rng = mulberry32(spec.seed)
    const stats: AttemptStats = { notUnique: 0, timeout: 0 }
    let made: {
      top: number[]
      bottom: number[]
      left: number[]
      right: number[]
      givens: number[]
      solution: number[]
    } | null = null
    const t0 = Date.now()
    for (let attempt = 0; attempt < spec.attempts; attempt++) {
      made = attemptPuzzle(spec, rng, stats)
      if (made) break
    }
    if (!made) {
      console.error(`[高楼 gen] ${spec.name} 失败统计：`, stats)
      throw new Error(`[高楼 gen] ${spec.name} 在 ${spec.attempts} 次尝试内没有生成合法题`)
    }
    console.log(
      `[高楼 gen] ${spec.name} ${spec.n}×${spec.n}：预填 ${made.givens.filter((v) => v !== 0).length}，${Date.now() - t0}ms`,
    )
    out.push({
      id: `skyscrapers-${spec.n}x${spec.n}-${spec.seed.toString(36)}`,
      name: spec.name,
      width: spec.n,
      height: spec.n,
      difficulty: spec.difficulty,
      series: spec.series,
      board: encodeBoard(made.givens, made.top, made.bottom, made.left, made.right),
      solution: encodeCells(made.solution),
    })
  }
  return out
}
