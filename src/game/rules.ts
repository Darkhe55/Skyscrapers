/**
 * 高楼 —— 规则引擎
 *
 * 规则（全部为可证明的安全定式，只做候选消除 / 强制落子，不假设唯一解）：
 *   clue    盘外线索极值：1 = 紧邻该侧是最高楼 n；n = 从该侧 1..n 单调递增
 *   visible 可见性排列：枚举符合两侧线索的整行 / 整列排列，按候选格取交集
 *   latin   拉丁方：唯一候选（naked single）、行 / 列隐藏单值（hidden single）
 *   subset  候选数对 / 三元组（naked pair / triple），行 / 列内交叉消除
 *   bound   可见高度上下界：阶数较大时用单侧线索的 DP 计算每格可取值
 *
 * 这些规则只排除「一定不成立」的候选；推不动时由 solver.ts / logic.ts 的
 * 反证与回溯兜底，因此规则增补不会改变题目解集。
 */

export type RuleKind = 'latin' | 'clue' | 'visible' | 'subset' | 'bound'

export type SetCallback = (index: number, value: number, rule: RuleKind) => void

/** 阶数 ≤ 此值时才做整行 / 整列排列枚举（n! 可控，6! = 720） */
const MAX_PERM_N = 6

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

/* ─────────────────────────── 位运算小工具 ─────────────────────────── */

const bit = (v: number): number => 1 << (v - 1)

const popcount = (m: number): number => {
  let c = 0
  while (m !== 0) {
    m &= m - 1
    c++
  }
  return c
}

/** 单 bit 掩码 → 对应的数字（1..n） */
const lowValue = (m: number): number => 32 - Math.clz32(m)

/* ─────────────────────── 行 / 列排列缓存（n ≤ 6） ─────────────────────── */

interface PermStore {
  /** 所有 n! 个排列，按 n 个一组平铺 */
  flat: Int8Array
  count: number
  /** 线索对 → 满足该线索对的排列（元素是 flat 的视图） */
  groups: Map<number, Int8Array[]>
}

const permStores = new Map<number, PermStore>()

function permStore(n: number): PermStore {
  const cached = permStores.get(n)
  if (cached) return cached
  let total = 1
  for (let k = 2; k <= n; k++) total *= k
  const flat = new Int8Array(total * n)
  const cur = new Int8Array(n)
  const used = new Uint8Array(n + 1)
  let at = 0
  const rec = (pos: number): void => {
    if (pos === n) {
      flat.set(cur, at * n)
      at++
      return
    }
    for (let v = 1; v <= n; v++) {
      if (used[v]) continue
      used[v] = 1
      cur[pos] = v
      rec(pos + 1)
      used[v] = 0
    }
  }
  rec(0)
  const store: PermStore = { flat, count: total, groups: new Map() }
  permStores.set(n, store)
  return store
}

/** 取满足线索对 (L, R) 的全部排列；L / R 为 0 表示该侧无线索 */
function permGroup(n: number, L: number, R: number): Int8Array[] {
  const store = permStore(n)
  const key = L * (n + 1) + R
  const cached = store.groups.get(key)
  if (cached) return cached
  const out: Int8Array[] = []
  const flat = store.flat
  for (let p = 0; p < store.count; p++) {
    const off = p * n
    if (L > 0) {
      let max = 0
      let count = 0
      for (let k = 0; k < n; k++) {
        const v = flat[off + k]!
        if (v > max) {
          max = v
          count++
        }
      }
      if (count !== L) continue
    }
    if (R > 0) {
      let max = 0
      let count = 0
      for (let k = n - 1; k >= 0; k--) {
        const v = flat[off + k]!
        if (v > max) {
          max = v
          count++
        }
      }
      if (count !== R) continue
    }
    out.push(flat.subarray(off, off + n))
  }
  store.groups.set(key, out)
  return out
}

/* ─────────────── 单侧线索的可见高度上下界 DP（阶数较大时） ─────────────── */

/**
 * 给定每格的候选掩码（按观察方向排列）与该侧可见数 clue，
 * 返回每格「存在某个完整排列可取值」的掩码；无解返回 null。
 * 复杂度 O(n^4)，n ≤ 9 时开销很小。
 */
function lineAllowedByClue(n: number, posMasks: Uint16Array, clue: number): Uint16Array | null {
  const W = n + 1
  const at = (max: number, cnt: number): number => max * W + cnt
  const reachByPos: Uint8Array[] = []
  let reach = new Uint8Array(W * W)
  reach[at(0, 0)] = 1
  reachByPos.push(reach)
  for (let pos = 0; pos < n; pos++) {
    const next = new Uint8Array(W * W)
    const mask = posMasks[pos]!
    for (let max = 0; max <= n; max++) {
      for (let cnt = 0; cnt <= clue; cnt++) {
        if (!reach[at(max, cnt)]) continue
        for (let v = 1; v <= n; v++) {
          if (!(mask & bit(v))) continue
          const higher = v > max
          const ncnt = cnt + (higher ? 1 : 0)
          if (ncnt > clue) continue
          next[at(higher ? v : max, ncnt)] = 1
        }
      }
    }
    reach = next
    reachByPos.push(next)
  }
  let finishable = false
  for (let max = 0; max <= n; max++) {
    if (reach[at(max, clue)]) {
      finishable = true
      break
    }
  }
  if (!finishable) return null

  const feasByPos: Uint8Array[] = new Array(n + 1)
  let feas = new Uint8Array(W * W)
  for (let max = 0; max <= n; max++) feas[at(max, clue)] = 1
  feasByPos[n] = feas
  for (let pos = n - 1; pos >= 0; pos--) {
    const cur = new Uint8Array(W * W)
    const mask = posMasks[pos]!
    for (let max = 0; max <= n; max++) {
      for (let cnt = 0; cnt <= clue; cnt++) {
        for (let v = 1; v <= n; v++) {
          if (!(mask & bit(v))) continue
          const higher = v > max
          const ncnt = cnt + (higher ? 1 : 0)
          if (ncnt > clue) continue
          if (feas[at(higher ? v : max, ncnt)]) {
            cur[at(max, cnt)] = 1
            break
          }
        }
      }
    }
    feas = cur
    feasByPos[pos] = feas
  }

  const allowed = new Uint16Array(n)
  for (let pos = 0; pos < n; pos++) {
    const reachable = reachByPos[pos]!
    const feasNext = feasByPos[pos + 1]!
    const mask = posMasks[pos]!
    let out = 0
    for (let max = 0; max <= n; max++) {
      for (let cnt = 0; cnt <= clue; cnt++) {
        if (!reachable[at(max, cnt)]) continue
        for (let v = 1; v <= n; v++) {
          if (!(mask & bit(v))) continue
          const higher = v > max
          const ncnt = cnt + (higher ? 1 : 0)
          if (ncnt > clue) continue
          if (feasNext[at(higher ? v : max, ncnt)]) out |= bit(v)
        }
      }
    }
    if (out === 0) return null
    allowed[pos] = out
  }
  return allowed
}

/* ───────────────────────────── 主传播 ───────────────────────────── */

export function propagate(
  cells: number[],
  n: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  onSet?: SetCallback,
): boolean {
  const size = n * n
  const all = (1 << n) - 1

  const rows: number[][] = []
  const cols: number[][] = []
  for (let y = 0; y < n; y++) {
    const row: number[] = []
    for (let x = 0; x < n; x++) row.push(y * n + x)
    rows.push(row)
  }
  for (let x = 0; x < n; x++) {
    const col: number[] = []
    for (let y = 0; y < n; y++) col.push(y * n + x)
    cols.push(col)
  }

  const cand = new Uint16Array(size)
  for (let i = 0; i < size; i++) cand[i] = cells[i]! > 0 ? bit(cells[i]!) : all

  let changed = true

  /** 落子：只有「本来为空」才写入；与已有值冲突返回 false */
  const place = (i: number, v: number, kind: RuleKind): boolean => {
    if (cells[i] === v) {
      cand[i] = bit(v)
      return true
    }
    if (cells[i] !== 0) return false
    cells[i] = v
    cand[i] = bit(v)
    onSet?.(i, v, kind)
    changed = true
    return true
  }

  /** 候选收窄；收窄到 1 个时落子 */
  const prune = (i: number, mask: number, kind: RuleKind): boolean => {
    const keep = cand[i]! & mask
    if (keep === cand[i]) return true
    cand[i] = keep
    changed = true
    if (keep === 0) return false
    if ((keep & (keep - 1)) === 0) return place(i, lowValue(keep), kind)
    return true
  }

  /** 单行 / 单列的可见性排列（或大阶数的上下界）交叉消除 */
  const applyLine = (line: number[], L: number, R: number): boolean => {
    if (L === 0 && R === 0) return true
    if (n <= MAX_PERM_N) {
      const group = permGroup(n, L, R)
      const allowed = new Uint16Array(n)
      let survivors = 0
      for (let p = 0; p < group.length; p++) {
        const perm = group[p]!
        let ok = true
        for (let k = 0; k < n; k++) {
          if (!(cand[line[k]!]! & bit(perm[k]!))) {
            ok = false
            break
          }
        }
        if (!ok) continue
        survivors++
        for (let k = 0; k < n; k++) allowed[k] = allowed[k]! | bit(perm[k]!)
      }
      if (survivors === 0) return false
      for (let k = 0; k < n; k++) {
        if (!prune(line[k]!, allowed[k]!, 'visible')) return false
      }
      return true
    }

    // n ≥ 7：不做全排列枚举，改用单侧线索 DP 的上下界（仍为精确单侧约束）
    const masks = new Uint16Array(n)
    for (let k = 0; k < n; k++) masks[k] = cand[line[k]!]!
    let byLeft: Uint16Array | null = null
    let byRight: Uint16Array | null = null
    if (L > 0) {
      byLeft = lineAllowedByClue(n, masks, L)
      if (!byLeft) return false
    }
    if (R > 0) {
      const rev = new Uint16Array(n)
      for (let k = 0; k < n; k++) rev[k] = masks[n - 1 - k]!
      byRight = lineAllowedByClue(n, rev, R)
      if (!byRight) return false
    }
    for (let k = 0; k < n; k++) {
      let keep = cand[line[k]!]!
      if (byLeft) keep &= byLeft[k]!
      if (byRight) keep &= byRight[n - 1 - k]!
      if (!prune(line[k]!, keep, 'bound')) return false
    }
    return true
  }

  /** 行 / 列内的显性数对与三元组 */
  const applySubsets = (line: number[]): boolean => {
    const empty: number[] = []
    for (const i of line) if (cells[i] === 0) empty.push(i)
    if (empty.length < 3) return true
    // 数对
    for (let a = 0; a < empty.length; a++) {
      const ia = empty[a]!
      const ma = cand[ia]!
      if (popcount(ma) !== 2) continue
      for (let b = a + 1; b < empty.length; b++) {
        const ib = empty[b]!
        if (cand[ib] !== ma) continue
        for (const i of empty) {
          if (i === ia || i === ib) continue
          if (cand[i]! & ma) {
            if (!prune(i, ~ma, 'subset')) return false
          }
        }
      }
    }
    // 三元组
    for (let a = 0; a < empty.length; a++) {
      const ia = empty[a]!
      const ma = cand[ia]!
      const ca = popcount(ma)
      if (ca < 2 || ca > 3) continue
      for (let b = a + 1; b < empty.length; b++) {
        const ib = empty[b]!
        const mb = cand[ib]!
        if (popcount(mb) > 3) continue
        for (let c = b + 1; c < empty.length; c++) {
          const ic = empty[c]!
          const mc = cand[ic]!
          if (popcount(mc) > 3) continue
          const union = ma | mb | mc
          if (popcount(union) !== 3) continue
          for (const i of empty) {
            if (i === ia || i === ib || i === ic) continue
            if (cand[i]! & union) {
              if (!prune(i, ~union, 'subset')) return false
            }
          }
        }
      }
    }
    return true
  }

  while (changed) {
    changed = false

    // 1. 已填格同步：候选收窄为单值，并从同行同列删去该值
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x
        const v = cells[i]!
        if (v === 0) continue
        const b = bit(v)
        cand[i] = b
        const row = rows[y]!
        for (let k = 0; k < n; k++) {
          if (k !== x) {
            const j = row[k]!
            if (cells[j] === v) return false
            if (!prune(j, ~b, 'latin')) return false
          }
        }
        const col = cols[x]!
        for (let k = 0; k < n; k++) {
          if (k !== y) {
            const j = col[k]!
            if (cells[j] === v) return false
            if (!prune(j, ~b, 'latin')) return false
          }
        }
      }
    }

    // 2. 盘外线索极值
    for (let y = 0; y < n; y++) {
      const L = left[y] ?? 0
      const R = right[y] ?? 0
      if (L < 0 || L > n || R < 0 || R > n) return false
      const row = rows[y]!
      if (L === n) {
        for (let x = 0; x < n; x++) if (!place(row[x]!, x + 1, 'clue')) return false
      } else if (L === 1) {
        if (!place(row[0]!, n, 'clue')) return false
      }
      if (R === n) {
        for (let x = 0; x < n; x++) if (!place(row[n - 1 - x]!, x + 1, 'clue')) return false
      } else if (R === 1) {
        if (!place(row[n - 1]!, n, 'clue')) return false
      }
    }
    for (let x = 0; x < n; x++) {
      const T = top[x] ?? 0
      const B = bottom[x] ?? 0
      if (T < 0 || T > n || B < 0 || B > n) return false
      const col = cols[x]!
      if (T === n) {
        for (let y = 0; y < n; y++) if (!place(col[y]!, y + 1, 'clue')) return false
      } else if (T === 1) {
        if (!place(col[0]!, n, 'clue')) return false
      }
      if (B === n) {
        for (let y = 0; y < n; y++) if (!place(col[n - 1 - y]!, y + 1, 'clue')) return false
      } else if (B === 1) {
        if (!place(col[n - 1]!, n, 'clue')) return false
      }
    }

    // 3. 可见性排列 / 上下界：行、列交叉消除
    for (let y = 0; y < n; y++) {
      if (!applyLine(rows[y]!, left[y] ?? 0, right[y] ?? 0)) return false
    }
    for (let x = 0; x < n; x++) {
      if (!applyLine(cols[x]!, top[x] ?? 0, bottom[x] ?? 0)) return false
    }

    // 4. 拉丁方：唯一候选
    for (let i = 0; i < size; i++) {
      if (cells[i] !== 0) continue
      const m = cand[i]!
      if (m === 0) return false
      if ((m & (m - 1)) === 0 && !place(i, lowValue(m), 'latin')) return false
    }

    // 5. 拉丁方：行 / 列隐藏单值
    for (let y = 0; y < n; y++) {
      const row = rows[y]!
      let placed = 0
      for (const i of row) if (cells[i] !== 0) placed |= bit(cells[i]!)
      for (let v = 1; v <= n; v++) {
        const b = bit(v)
        if (placed & b) continue
        let spot = -1
        let count = 0
        for (const i of row) {
          if (cells[i] === 0 && (cand[i]! & b)) {
            spot = i
            count++
            if (count > 1) break
          }
        }
        if (count === 0) return false
        if (count === 1 && !place(spot, v, 'latin')) return false
      }
    }
    for (let x = 0; x < n; x++) {
      const col = cols[x]!
      let placed = 0
      for (const i of col) if (cells[i] !== 0) placed |= bit(cells[i]!)
      for (let v = 1; v <= n; v++) {
        const b = bit(v)
        if (placed & b) continue
        let spot = -1
        let count = 0
        for (const i of col) {
          if (cells[i] === 0 && (cand[i]! & b)) {
            spot = i
            count++
            if (count > 1) break
          }
        }
        if (count === 0) return false
        if (count === 1 && !place(spot, v, 'latin')) return false
      }
    }

    // 6. 显性数对 / 三元组
    for (let y = 0; y < n; y++) if (!applySubsets(rows[y]!)) return false
    for (let x = 0; x < n; x++) if (!applySubsets(cols[x]!)) return false
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
