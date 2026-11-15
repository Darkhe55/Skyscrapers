/**
 * 高楼 —— 规则引擎
 */

export type RuleKind = 'latin' | 'clue'

export type SetCallback = (index: number, value: number, rule: RuleKind) => void

export function initialGrid(givens: ArrayLike<number>, size: number): number[] {
  const grid = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    const v = givens[i] ?? 0
    if (v >= 1) grid[i] = v
  }
  return grid
}

export function visibleCount(line: ArrayLike<number>): number {
  let max = 0
  let count = 0
  for (let i = 0; i < line.length; i++) {
    const v = line[i]!
    if (v > max) {
      max = v
      count++
    }
  }
  return count
}

export function propagate(
  cells: number[],
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  onSet?: SetCallback,
): boolean {
  let changed = true

  const set = (i: number, value: number, kind: RuleKind): boolean => {
    if (cells[i] === value) return true
    if (cells[i] !== 0) return false
    cells[i] = value
    onSet?.(i, value, kind)
    changed = true
    return true
  }

  const setLine = (indices: number[], values: number[], kind: RuleKind): boolean => {
    for (let k = 0; k < indices.length; k++) {
      if (!set(indices[k]!, values[k]!, kind)) return false
    }
    return true
  }

  while (changed) {
    changed = false

    // 强线索：1 或 n
    for (let y = 0; y < n; y++) {
      const row: number[] = []
      for (let x = 0; x < n; x++) row.push(y * n + x)
      if ((left[y] ?? 0) === n) {
        if (!setLine(row, Array.from({ length: n }, (_, i) => i + 1), 'clue')) return false
      } else if ((left[y] ?? 0) === 1) {
        if (!set(row[0]!, n, 'clue')) return false
      }
      if ((right[y] ?? 0) === n) {
        if (!setLine(row, Array.from({ length: n }, (_, i) => n - i), 'clue')) return false
      } else if ((right[y] ?? 0) === 1) {
        if (!set(row[n - 1]!, n, 'clue')) return false
      }
    }
    for (let x = 0; x < n; x++) {
      const col: number[] = []
      for (let y = 0; y < n; y++) col.push(y * n + x)
      if ((top[x] ?? 0) === n) {
        if (!setLine(col, Array.from({ length: n }, (_, i) => i + 1), 'clue')) return false
      } else if ((top[x] ?? 0) === 1) {
        if (!set(col[0]!, n, 'clue')) return false
      }
      if ((bottom[x] ?? 0) === n) {
        if (!setLine(col, Array.from({ length: n }, (_, i) => n - i), 'clue')) return false
      } else if ((bottom[x] ?? 0) === 1) {
        if (!set(col[n - 1]!, n, 'clue')) return false
      }
    }

    // 拉丁方：所有候选都基于当前盘面重新计算，避免陈旧集合
    const candidatesOf = (i: number): number[] => {
      const x = i % n
      const y = (i / n) | 0
      const used = new Set<number>()
      for (let k = 0; k < n; k++) {
        if (cells[y * n + k] !== 0) used.add(cells[y * n + k]!)
        if (cells[k * n + x] !== 0) used.add(cells[k * n + x]!)
      }
      const out: number[] = []
      for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v)
      return out
    }

    // 先检查行列重复
    for (let y = 0; y < n; y++) {
      const seen = new Set<number>()
      for (let x = 0; x < n; x++) {
        const v = cells[y * n + x]!
        if (v === 0) continue
        if (seen.has(v)) return false
        seen.add(v)
      }
    }
    for (let x = 0; x < n; x++) {
      const seen = new Set<number>()
      for (let y = 0; y < n; y++) {
        const v = cells[y * n + x]!
        if (v === 0) continue
        if (seen.has(v)) return false
        seen.add(v)
      }
    }

    // 唯一候选
    for (let i = 0; i < n * n; i++) {
      if (cells[i] !== 0) continue
      const cands = candidatesOf(i)
      if (cands.length === 0) return false
      if (cands.length === 1 && !set(i, cands[0]!, 'latin')) return false
    }

    // 行内隐藏单值
    for (let y = 0; y < n; y++) {
      const has = new Set<number>()
      for (let x = 0; x < n; x++) if (cells[y * n + x] !== 0) has.add(cells[y * n + x]!)
      for (let v = 1; v <= n; v++) {
        if (has.has(v)) continue
        const spots: number[] = []
        for (let x = 0; x < n; x++) {
          const i = y * n + x
          if (cells[i] === 0 && candidatesOf(i).includes(v)) spots.push(i)
        }
        if (spots.length === 0) return false
        if (spots.length === 1 && !set(spots[0]!, v, 'latin')) return false
      }
    }

    // 列内隐藏单值
    for (let x = 0; x < n; x++) {
      const has = new Set<number>()
      for (let y = 0; y < n; y++) if (cells[y * n + x] !== 0) has.add(cells[y * n + x]!)
      for (let v = 1; v <= n; v++) {
        if (has.has(v)) continue
        const spots: number[] = []
        for (let y = 0; y < n; y++) {
          const i = y * n + x
          if (cells[i] === 0 && candidatesOf(i).includes(v)) spots.push(i)
        }
        if (spots.length === 0) return false
        if (spots.length === 1 && !set(spots[0]!, v, 'latin')) return false
      }
    }
  }

  return true
}

export function isValidSolution(
  cells: ArrayLike<number>,
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
): boolean {
  const size = n * n
  for (let i = 0; i < size; i++) {
    if (cells[i]! < 1 || cells[i]! > n) return false
  }
  for (let y = 0; y < n; y++) {
    const seen = new Set<number>()
    for (let x = 0; x < n; x++) {
      const v = cells[y * n + x]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }
  for (let x = 0; x < n; x++) {
    const seen = new Set<number>()
    for (let y = 0; y < n; y++) {
      const v = cells[y * n + x]!
      if (seen.has(v)) return false
      seen.add(v)
    }
  }

  for (let x = 0; x < n; x++) {
    const col: number[] = []
    for (let y = 0; y < n; y++) col.push(cells[y * n + x]!)
    if ((top[x] ?? 0) > 0 && visibleCount(col) !== top[x]) return false
    if ((bottom[x] ?? 0) > 0 && visibleCount(col.slice().reverse()) !== bottom[x]) return false
  }
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) row.push(cells[y * n + x]!)
    if ((left[y] ?? 0) > 0 && visibleCount(row) !== left[y]) return false
    if ((right[y] ?? 0) > 0 && visibleCount(row.slice().reverse()) !== right[y]) return false
  }
  return true
}

export interface RuleSolveResult {
  ok: boolean
  solution: number[] | null
  contradiction: boolean
  saturated: boolean
  usedProbing: boolean
}

export function solveByRules(
  givens: ArrayLike<number>,
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  probing = true,
  maxRounds = 400,
): RuleSolveResult {
  const size = n * n
  const grid = initialGrid(givens, size)
  let usedProbing = false
  for (let round = 0; round < maxRounds; round++) {
    if (!propagate(grid, n, top, bottom, left, right)) {
      return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
    }
    let unknown = -1
    for (let i = 0; i < size; i++) {
      if (grid[i] === 0) {
        unknown = i
        break
      }
    }
    if (unknown < 0) {
      const solution = Array.from(grid)
      const ok = isValidSolution(solution, n, top, bottom, left, right)
      return { ok, solution: ok ? solution : null, contradiction: false, saturated: ok, usedProbing }
    }
    if (!probing) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }
    usedProbing = true
    const forced: Array<{ index: number; value: number }> = []
    for (let i = 0; i < size; i++) {
      if (grid[i] !== 0) continue
      const feasible: number[] = []
      for (let v = 1; v <= n; v++) {
        const trial = grid.slice()
        trial[i] = v
        if (propagate(trial, n, top, bottom, left, right)) feasible.push(v)
      }
      if (feasible.length === 0) {
        return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
      }
      if (feasible.length === 1) forced.push({ index: i, value: feasible[0]! })
    }
    if (!forced.length) {
      return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
    }
    for (const { index, value } of forced) {
      if (grid[index] === 0) grid[index] = value
    }
    if (!propagate(grid, n, top, bottom, left, right)) {
      return { ok: false, solution: null, contradiction: true, saturated: false, usedProbing }
    }
  }
  return { ok: false, solution: null, contradiction: false, saturated: false, usedProbing }
}
