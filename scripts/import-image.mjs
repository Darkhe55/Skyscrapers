/**
 * 高楼（Skyscrapers）题面图片导入（全自动识图）
 *
 * 用法：
 *   node scripts/import-image.mjs <图片路径> [--n 9] [--name 名称] [--series 识图]
 *                                  [--append] [--verify] [--dry] [--json out.json]
 *                                  [--map "簇=数字,..."] [--fix "cell:x,y=值,top:i=值,..."]
 *
 * 流程：
 *   1. Playwright + Edge 打开图片到 canvas，取灰度像素；
 *   2. 用「白格内部连通域」定位 n×n 个格子（原题是格子之间留空隙的样式），
 *      用灰色气泡（提示箭头）连通域定位 4n 个盘外提示位；
 *   3. 格内数字 / 气泡内数字分别做字形归一化 → 平移容差聚类 → 多字体多字号
 *      模板匹配（含亚像素相位）自动判读 1..n；
 *   4. 预览题面并做结构校验；--verify 调项目 solver 检查唯一解并生成参考解；
 *   5. --append 写入 src/game/imported-puzzles.ts（不会被 npm run gen 覆盖）。
 *
 * --map：人工覆盖字形簇，例如 --map "3=7,5=2"（簇号见预览表格）。
 * --fix：人工覆盖具体数值，例如 --fix "cell:4,2=5,top:0=3,bottom:8=2,left:1=4,right:6=1"。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { encodeBoard } from '../src/game/types.ts'
import { countSolutions, solvePuzzle } from '../src/game/solver.ts'

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function edgePath() {
  for (const c of EDGE_CANDIDATES) if (c && existsSync(c)) return c
  throw new Error('找不到 Edge 可执行文件，请用 EDGE_PATH 指定')
}

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
function arg(flag, fallback = '') {
  const i = args.indexOf(flag)
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback
}
function argEq(flag) {
  for (const a of args) if (a.startsWith(flag + '=')) return a.slice(flag.length + 1)
  return null
}
function takeValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const VALUE_FLAGS = new Set(['--name', '--series', '--json', '--map', '--fix', '--n'])
const imageArg = args.find((a) => !a.startsWith('--') && !VALUE_FLAGS.has(args[args.indexOf(a) - 1]))
if (!imageArg) {
  console.error(
    '用法：node scripts/import-image.mjs <图片路径> [--n 9] [--name 名称] [--series 识图] [--append] [--verify] [--dry] [--json out.json] [--map "簇=数字,..."] [--fix "cell:x,y=值,top:i=值,..."]',
  )
  process.exit(1)
}
const IMAGE = path.resolve(imageArg)
if (!existsSync(IMAGE)) {
  console.error('找不到图片:', IMAGE)
  process.exit(1)
}

const nOpt = Number(arg('--n', '0')) || 0
const nameOpt = arg('--name')
const series = arg('--series', '识图')
const jsonOut = arg('--json')
const append = has('--append')
const verifyOpt = has('--verify')
const dry = has('--dry')

const mapArg = argEq('--map') ?? takeValue('--map')
const manualClusters = new Map()
if (mapArg) {
  for (const pair of mapArg.split(/[,;]/)) {
    const m = /^\s*(\d+)\s*=\s*(\d+)\s*$/.exec(pair)
    if (!m) {
      console.error(`--map 格式错误：${pair}（应为 簇号=数字）`)
      process.exit(1)
    }
    manualClusters.set(Number(m[1]), Number(m[2]))
  }
}
const fixArg = argEq('--fix') ?? takeValue('--fix')
const fixes = { cells: new Map(), top: new Map(), bottom: new Map(), left: new Map(), right: new Map() }
if (fixArg) {
  for (const part of fixArg.split(/[,;]/)) {
    const m = /^\s*(cell|top|bottom|left|right):\s*(\d+)\s*(?:,\s*(\d+))?\s*=\s*(\d+)\s*$/.exec(part)
    if (!m) {
      console.error(`--fix 格式错误：${part}`)
      process.exit(1)
    }
    const [, kind, a, b, v] = m
    if (kind === 'cell') {
      fixes.cells.set(`${a},${b}`, Number(v))
    } else {
      fixes[kind].set(Number(a), Number(v))
    }
  }
}

/* ───────────────────────── 浏览器端几何 + 字形提取 ───────────────────────── */

const dataUrl = `data:image/png;base64,${readFileSync(IMAGE).toString('base64')}`
const browser = await chromium.launch({ headless: true, executablePath: edgePath() })
const page = await browser.newPage()
await page.setContent('<canvas id="c"></canvas>')

const analysis = await page.evaluate(async (dataUrl) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const W = img.naturalWidth
  const H = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0)
  const px = g.getImageData(0, 0, W, H).data
  const gray = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : 0.299 * px[(y * W + x) * 4] + 0.587 * px[(y * W + x) * 4 + 1] + 0.114 * px[(y * W + x) * 4 + 2])

  // 连通域（mask 由 pick(x,y) 决定是否属于当前标签）
  const components = (pick, minArea, maxArea, maxBox) => {
    const seen = new Uint8Array(W * H)
    const out = []
    for (let y0 = 0; y0 < H; y0++) {
      for (let x0 = 0; x0 < W; x0++) {
        const k0 = y0 * W + x0
        if (seen[k0] || !pick(x0, y0)) continue
        let n = 0
        let minX = x0
        let maxX = x0
        let minY = y0
        let maxY = y0
        const st = [[x0, y0]]
        seen[k0] = 1
        while (st.length) {
          const [x, y] = st.pop()
          n++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue
              const nx = x + dx
              const ny = y + dy
              if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
              const k = ny * W + nx
              if (seen[k] || !pick(nx, ny)) continue
              seen[k] = 1
              st.push([nx, ny])
            }
          }
        }
        if (n < minArea || n > maxArea) continue
        const bw = maxX - minX + 1
        const bh = maxY - minY + 1
        if (maxBox && (bw > maxBox || bh > maxBox)) continue
        out.push({ n, minX, minY, maxX, maxY, bw, bh })
      }
    }
    return out
  }

  // 字形归一化：按墨迹包围盒采样到 20×20
  const NS = 20
  const glyphOf = (box, isInk, inset = 0) => {
    const x0 = box.minX + inset
    const y0 = box.minY + inset
    const x1 = box.maxX - inset
    const y1 = box.maxY - inset
    let ix0 = x1 + 1
    let iy0 = y1 + 1
    let ix1 = x0 - 1
    let iy1 = y0 - 1
    let ink = 0
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!isInk(x, y)) continue
        ink++
        if (x < ix0) ix0 = x
        if (x > ix1) ix1 = x
        if (y < iy0) iy0 = y
        if (y > iy1) iy1 = y
      }
    }
    if (ink < 4 || ix1 < ix0) return null
    const bw = ix1 - ix0 + 1
    const bh = iy1 - iy0 + 1
    const m = new Array(NS * NS).fill(0)
    for (let j = 0; j < NS; j++) {
      const sy = iy0 + Math.min(bh - 1, Math.floor((j * bh) / NS))
      for (let i = 0; i < NS; i++) {
        const sx = ix0 + Math.min(bw - 1, Math.floor((i * bw) / NS))
        m[j * NS + i] = isInk(sx, sy) ? 1 : 0
      }
    }
    return { m, ink, w: bw, h: bh }
  }

  // 1) 白格内部：浅色连通域，尺寸像一个格子
  const light = (x, y) => gray(x, y) >= 248
  const lightComps = components(light, 1200, 9000, 120)
  const cellComps = lightComps.filter((c) => c.bw >= 40 && c.bh >= 40 && c.bw <= 90 && c.bh <= 90 && Math.abs(c.bw - c.bh) <= 8)
  if (cellComps.length < 16) throw new Error(`只找到 ${cellComps.length} 个格子内部，题图样式可能不匹配`)

  // 按中心聚成行列
  const cluster1d = (values, tol) => {
    const sorted = values.slice().sort((a, b) => a - b)
    const out = []
    for (const v of sorted) {
      const last = out[out.length - 1]
      if (last && Math.abs(v - last.center) <= tol) {
        last.sum += v
        last.count++
        last.center = last.sum / last.count
      } else out.push({ center: v, sum: v, count: 1, values: [v] })
    }
    return out
  }
  const cellSize = cellComps.map((c) => Math.max(c.bw, c.bh)).sort((a, b) => a - b)[Math.floor(cellComps.length / 2)]
  const colCenters = cluster1d(cellComps.map((c) => (c.minX + c.maxX) / 2), cellSize * 0.45)
  const rowCenters = cluster1d(cellComps.map((c) => (c.minY + c.maxY) / 2), cellSize * 0.45)
  const nc = colCenters.length
  const nr = rowCenters.length
  if (nc < 3 || nr < 3 || nc !== nr) throw new Error(`格子行列不匹配：${nc} 列 × ${nr} 行`)

  // 格子中心按行列吸附
  const cellAt = Array.from({ length: nr }, () => new Array(nc).fill(null))
  for (const c of cellComps) {
    const cx = (c.minX + c.maxX) / 2
    const cy = (c.minY + c.maxY) / 2
    let ci = 0
    let best = Infinity
    for (let i = 0; i < nc; i++) {
      const d = Math.abs(colCenters[i].center - cx)
      if (d < best) {
        best = d
        ci = i
      }
    }
    let ri = 0
    best = Infinity
    for (let i = 0; i < nr; i++) {
      const d = Math.abs(rowCenters[i].center - cy)
      if (d < best) {
        best = d
        ri = i
      }
    }
    cellAt[ri][ci] = c
  }
  const missing = cellAt.flat().filter((c) => !c).length
  if (missing) throw new Error(`有 ${missing} 个格子没有识别到内部区域`)

  // 2) 盘外提示气泡：灰色填充（约 204）连通域
  const grayFill = (x, y) => {
    const v = gray(x, y)
    return v >= 190 && v <= 218
  }
  const tabComps = components(grayFill, 600, 20000, 200).filter((c) => c.bw >= 40 && c.bh >= 40)
  const gridLeft = Math.min(...cellComps.map((c) => c.minX))
  const gridRight = Math.max(...cellComps.map((c) => c.maxX))
  const gridTop = Math.min(...cellComps.map((c) => c.minY))
  const gridBottom = Math.max(...cellComps.map((c) => c.maxY))
  const sideOf = (c) => {
    const cx = (c.minX + c.maxX) / 2
    const cy = (c.minY + c.maxY) / 2
    if (cx < gridLeft - 5) return 'left'
    if (cx > gridRight + 5) return 'right'
    if (cy < gridTop - 5) return 'top'
    if (cy > gridBottom + 5) return 'bottom'
    return null
  }
  const nearestIndex = (v, centers) => {
    let bi = 0
    let best = Infinity
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i].center - v)
      if (d < best) {
        best = d
        bi = i
      }
    }
    return bi
  }
  const tabs = { top: new Array(nc).fill(null), bottom: new Array(nc).fill(null), left: new Array(nr).fill(null), right: new Array(nr).fill(null) }
  const tabInfo = []
  for (const c of tabComps) {
    const side = sideOf(c)
    if (!side) continue
    let idx
    if (side === 'top' || side === 'bottom') idx = nearestIndex((c.minX + c.maxX) / 2, colCenters)
    else idx = nearestIndex((c.minY + c.maxY) / 2, rowCenters)
    if (tabs[side][idx]) continue
    tabs[side][idx] = c
    tabInfo.push({ side, idx })
  }

  // 3) 格内预填数字：格子内部深色连通域
  const dark = (x, y) => gray(x, y) < 90
  const digitCandidates = (box, minH, maxH) =>
    components((x, y) => x >= box.minX + 2 && x <= box.maxX - 2 && y >= box.minY + 2 && y <= box.maxY - 2 && dark(x, y), 20, 4000, 90).filter(
      (c) => c.bh >= minH && c.bh <= maxH && c.bw >= 4 && c.bw <= 70,
    )

  const givens = []
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      const box = cellAt[r][c]
      const cand = digitCandidates(box, cellSize * 0.3, cellSize * 0.95)
      let glyph = null
      if (cand.length) {
        // 取墨迹最多的一个字形（n≤9 时每个格子只有一个数字）
        cand.sort((a, b) => b.n - a.n)
        glyph = glyphOf(cand[0], dark)
      }
      givens.push({ row: r, col: c, glyph })
    }
  }

  // 4) 气泡内数字：灰色底上深色数字（比气泡描边更深）
  const tabDark = (x, y) => gray(x, y) < 30
  const clues = { top: [], bottom: [], left: [], right: [] }
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const list = []
    for (let i = 0; i < tabs[side].length; i++) {
      const tab = tabs[side][i]
      if (!tab) {
        list.push(null)
        continue
      }
      const cand = components(
        (x, y) => x >= tab.minX + 3 && x <= tab.maxX - 3 && y >= tab.minY + 3 && y <= tab.maxY - 3 && tabDark(x, y),
        20,
        4000,
        90,
      ).filter((c) => c.bh >= 12 && c.bh <= 70 && c.bw >= 3 && c.bw <= 40 && c.n >= 80)
      if (!cand.length) {
        list.push(null)
        continue
      }
      cand.sort((a, b) => a.minX - b.minX)
      // 多位数（n > 9 时可能出现）：横向合并为同一个数字
      const first = cand[0]
      const x0 = first.minX
      let x1 = first.maxX
      let y0 = first.minY
      let y1 = first.maxY
      for (let k = 1; k < cand.length; k++) {
        x1 = Math.max(x1, cand[k].maxX)
        y0 = Math.min(y0, cand[k].minY)
        y1 = Math.max(y1, cand[k].maxY)
      }
      list.push(glyphOf({ minX: x0, minY: y0, maxX: x1, maxY: y1 }, tabDark))
    }
    clues[side] = list
  }

  return {
    W,
    H,
    n: nc,
    cellSize: Number(cellSize.toFixed(2)),
    grids: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom },
    tabCount: tabInfo.length,
    givenGlyphs: givens,
    clueGlyphs: clues,
    cellBoxes: cellAt.map((row) => row.map((c) => ({ x0: c.minX, y0: c.minY, x1: c.maxX, y1: c.maxY }))),
  }
}, dataUrl)

/* ───────────────────────── 字形模板 ───────────────────────── */

const NS = 20
const DIGITS = '0123456789'
const templates = await page.evaluate(({ NS, DIGITS }) => {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const g = canvas.getContext('2d', { willReadFrequently: true })
  const FONTS = [
    'Arial',
    'Segoe UI',
    'Verdana',
    'Tahoma',
    'Trebuchet MS',
    'Calibri',
    'Microsoft YaHei',
    'Consolas',
  ]
  const WEIGHTS = [400, 700]
  const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56]
  const out = {}
  for (const ch of DIGITS) out[ch] = []
  const norm = (px, threshold) => {
    let x0 = 96
    let y0 = 96
    let x1 = -1
    let y1 = -1
    let ink = 0
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 96; x++) {
        if (px[(y * 96 + x) * 4] >= threshold) {
          ink++
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (!ink) return null
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    const m = new Array(NS * NS).fill(0)
    for (let j = 0; j < NS; j++) {
      const sy = y0 + Math.min(bh - 1, Math.floor((j * bh) / NS))
      for (let i = 0; i < NS; i++) {
        const sx = x0 + Math.min(bw - 1, Math.floor((i * bw) / NS))
        m[j * NS + i] = px[(sy * 96 + sx) * 4] >= threshold ? 1 : 0
      }
    }
    return { m, w: bw, h: bh }
  }
  for (const font of FONTS) {
    for (const weight of WEIGHTS) {
      for (const size of SIZES) {
        for (const phase of [0, 0.25, 0.5, 0.75]) {
          for (const ch of DIGITS) {
            g.fillStyle = '#000'
            g.fillRect(0, 0, 96, 96)
            g.fillStyle = '#fff'
            g.font = `${weight} ${size}px "${font}"`
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText(ch, 48 + phase, 48 + phase)
            const data = g.getImageData(0, 0, 96, 96).data
            for (const thr of [160]) {
              const t = norm(data, thr)
              if (t) out[ch].push({ m: t.m, w: t.w, h: t.h, font, weight, size })
            }
          }
        }
      }
    }
  }
  return out
}, { NS, DIGITS })

function simShift(a, b, radius = 1) {
  let best = 0
  let bestShift = [0, 0]
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let inter = 0
      let uni = 0
      for (let j = 0; j < NS; j++) {
        const bj = j + dy
        for (let i = 0; i < NS; i++) {
          const av = a[j * NS + i]
          const bi = i + dx
          const bv = bj >= 0 && bj < NS && bi >= 0 && bi < NS ? b[bj * NS + bi] : 0
          if (av && bv) inter++
          if (av || bv) uni++
        }
      }
      const s = uni ? inter / uni : 0
      if (s > best) {
        best = s
        bestShift = [dx, dy]
      }
    }
  }
  return { score: best, dx: bestShift[0], dy: bestShift[1] }
}

/** 平移容差聚类；返回簇原型（按成员数降序） */
function clusterGlyphs(glyphs, threshold) {
  const clusters = []
  for (const glyph of glyphs) {
    let best = -1
    let bi = -1
    for (let k = 0; k < clusters.length; k++) {
      const s = simShift(glyph.m, clusters[k].proto).score
      if (s > best) {
        best = s
        bi = k
      }
    }
    if (bi >= 0 && best >= threshold) {
      const cl = clusters[bi]
      cl.count++
      cl.members.push(glyph)
      if (cl.members.length <= 40) {
        for (let i = 0; i < glyph.m.length; i++) cl.sum[i] += glyph.m[i]
        for (let i = 0; i < glyph.m.length; i++) cl.proto[i] = cl.sum[i] / cl.count >= 0.5 ? 1 : 0
      }
    } else {
      clusters.push({ count: 1, members: [glyph], sum: glyph.m.slice(), proto: glyph.m.slice() })
    }
  }
  clusters.sort((a, b) => b.count - a.count)
  return clusters
}

/* ───────────────────────── 判读 ───────────────────────── */

const allGlyphs = []
for (const entry of analysis.givenGlyphs) if (entry.glyph) allGlyphs.push({ kind: 'cell', row: entry.row, col: entry.col, ...entry.glyph })
for (const side of ['top', 'bottom', 'left', 'right']) {
  analysis.clueGlyphs[side].forEach((glyph, idx) => {
    if (glyph) allGlyphs.push({ kind: 'clue', side, idx, ...glyph })
  })
}
if (!allGlyphs.length) {
  console.error('[import] 没有识别到任何数字')
  process.exit(1)
}

const clusters = clusterGlyphs(allGlyphs, 0.86)
const clusterTable = clusters.map((cl, k) => {
  const scores = DIGITS.split('').map((ch) => {
    let best = 0
    let meta = null
    for (const t of templates[ch]) {
      const s = simShift(cl.proto, t.m).score
      if (s > best) {
        best = s
        meta = t
      }
    }
    return { ch, score: best, meta }
  })
  scores.sort((a, b) => b.score - a.score)
  const manual = manualClusters.get(k)
  return {
    k,
    count: cl.count,
    label: manual ?? Number(scores[0].ch),
    auto: Number(scores[0].ch),
    margin: scores[0].score - scores[1].score,
    scores: scores.slice(0, 3),
    manual: manual !== undefined,
    proto: cl.proto,
  }
})

console.log(
  `[import] ${path.basename(IMAGE)}：${analysis.W}×${analysis.H}px，格子 ${analysis.cellSize}px，` +
    `识别 ${analysis.n}×${analysis.n}，提示位 ${analysis.tabCount} 个，字形 ${allGlyphs.length} 个 / ${clusters.length} 簇`,
)
console.log('[import] 字形簇判读（--map 簇号=数字 可人工覆盖）：')
for (const row of clusterTable) {
  const flag = row.manual ? '人工' : row.margin < 0.06 ? '低置信' : '自动'
  console.log(
    `  簇${String(row.k).padStart(2)} n=${String(row.count).padStart(3)} → ${row.label}（${flag}，` +
      `${row.scores.map((s) => `${s.ch}:${s.score.toFixed(2)}`).join(' ')}）`,
  )
}
const lowConf = clusterTable.filter((r) => !r.manual && r.margin < 0.06)
if (lowConf.length) console.warn(`[import] 注意：${lowConf.length} 个字形簇置信度较低，必要时用 --map 修正`)

// 每簇一种取值来源
const labelOf = new Map(clusterTable.map((row) => [row.k, row.label]))
// 回填每个字形对应的簇号
function clusterIndexFor(glyph) {
  let best = -1
  let bi = 0
  clusters.forEach((cl, k) => {
    const s = simShift(glyph.m, cl.proto).score
    if (s > best) {
      best = s
      bi = k
    }
  })
  return bi
}

const n = nOpt || analysis.n
if (n !== analysis.n) {
  console.warn(`[import] --n ${n} 与识别到的 ${analysis.n} 不一致，按识别结果继续（可加 --n 覆盖尺寸）`)
}
const N = analysis.n

const givens = new Array(N * N).fill(0)
for (const entry of analysis.givenGlyphs) {
  if (!entry.glyph) continue
  const k = clusterIndexFor(entry.glyph)
  givens[entry.row * N + entry.col] = labelOf.get(k) ?? 0
}
const clueArrays = { top: new Array(N).fill(0), bottom: new Array(N).fill(0), left: new Array(N).fill(0), right: new Array(N).fill(0) }
for (const side of ['top', 'bottom', 'left', 'right']) {
  analysis.clueGlyphs[side].forEach((glyph, idx) => {
    if (!glyph) return
    const k = clusterIndexFor(glyph)
    clueArrays[side][idx] = labelOf.get(k) ?? 0
  })
}

// 人工覆盖
for (const [key, v] of fixes.cells) {
  const [x, y] = key.split(',').map(Number)
  if (x >= 0 && x < N && y >= 0 && y < N) givens[y * N + x] = v
  else console.warn(`[import] --fix cell:${key} 越界，忽略`)
}
for (const side of ['top', 'bottom', 'left', 'right']) {
  for (const [i, v] of fixes[side]) {
    if (i >= 0 && i < N) clueArrays[side][i] = v
    else console.warn(`[import] --fix ${side}:${i} 越界，忽略`)
  }
}

/* ───────────────────────── 校验 + 预览 ───────────────────────── */

const issues = []
for (let i = 0; i < N * N; i++) {
  const v = givens[i]
  if (!Number.isInteger(v) || v < 0 || v > N) issues.push(`预填格 (${i % N},${(i / N) | 0}) 值 ${v} 非法`)
}
for (const side of ['top', 'bottom', 'left', 'right']) {
  clueArrays[side].forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0 || v > N) issues.push(`${side}[${i}] 值 ${v} 非法`)
  })
}

console.log(`[import] 识别题面 ${N}×${N}：`)
for (let y = 0; y < N; y++) {
  console.log('  ' + String(y).padStart(2) + ' ' + givens.slice(y * N, y * N + N).map((v) => (v ? String(v) : '.')).join(' '))
}
console.log('[import] 盘外提示：')
for (const side of ['top', 'bottom', 'left', 'right']) {
  console.log(`  ${side.padEnd(6)} ${clueArrays[side].map((v) => (v ? String(v) : '.')).join(' ')}`)
}
const givenCount = givens.filter((v) => v > 0).length
const clueCount = ['top', 'bottom', 'left', 'right'].reduce((s, side) => s + clueArrays[side].filter((v) => v > 0).length, 0)
console.log(`[import] 预填 ${givenCount} 格，盘外提示 ${clueCount} 个`)
if (issues.length) {
  console.error(`[import] 题面结构问题 ${issues.length} 个：`)
  for (const msg of issues.slice(0, 20)) console.error('  - ' + msg)
  process.exitCode = 2
}

/* ───────────────────────── 求解校验 ───────────────────────── */

let solution = ''
let unique = false
if (!issues.length && verifyOpt) {
  const t0 = Date.now()
  const counted = countSolutions(givens, N, clueArrays.top, clueArrays.bottom, clueArrays.left, clueArrays.right, 2, 800_000)
  if (counted.timedOut) {
    console.warn(`[import] 唯一性检查超时（${counted.nodes} 节点，${Date.now() - t0}ms），仅警告`)
  } else if (counted.count === 0) {
    console.warn('[import] 题面无解：识别结果可能有误，请用 --map / --fix 修正')
  } else if (counted.count > 1) {
    console.warn(`[import] 解不唯一（至少 ${counted.count} 个），可能是识别错误；参考解留空`)
  } else {
    unique = true
    const solved = solvePuzzle(
      {
        id: 'import-temp',
        name: 'import-temp',
        width: N,
        height: N,
        difficulty: 'hard',
        givens,
        top: clueArrays.top,
        bottom: clueArrays.bottom,
        left: clueArrays.left,
        right: clueArrays.right,
      },
      1_500_000,
    )
    if (solved.solved && solved.solution) solution = solved.solution.cells.map((v) => String(v)).join('')
    console.log(`[import] 唯一解 ✓（${Date.now() - t0}ms，${counted.nodes} 节点）`)
  }
}

/* ───────────────────────── 导出 / 写入 ───────────────────────── */

const id = `skyscrapers-img-${N}x${N}-${Date.now().toString(36)}`
const name = nameOpt || `识图 · 高楼 ${N}×${N}`
const board = encodeBoard(givens, clueArrays.top, clueArrays.bottom, clueArrays.left, clueArrays.right)

if (jsonOut) {
  const file = path.resolve(jsonOut)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify(
      {
        width: N,
        height: N,
        givens,
        top: clueArrays.top,
        bottom: clueArrays.bottom,
        left: clueArrays.left,
        right: clueArrays.right,
        board,
        solution: solution || null,
        unique,
        source: path.basename(IMAGE),
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`[import] 已导出 JSON：${file}`)
}

if (append) {
  if (dry) {
    console.log('[import] --dry：跳过写入')
  } else if (issues.length) {
    console.error('[import] 题面结构有问题，拒绝写入（可用 --fix 修正后重跑）')
    process.exitCode = 2
  } else {
    const file = path.resolve('src/game/imported-puzzles.ts')
    const entry =
      `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, width: ${N}, height: ${N}, ` +
      `difficulty: 'hard', series: ${JSON.stringify(series)}, board: ${JSON.stringify(board)}, ` +
      `solution: ${JSON.stringify(solution)} },\n`
    if (!existsSync(file)) {
      writeFileSync(
        file,
        `/* 图片识别导入的题（scripts/import-image.mjs --append 写入；npm run gen 不会覆盖） */\n` +
          `import type { RawPuzzle } from './puzzles-data'\n\nexport const IMPORTED_PUZZLES: RawPuzzle[] = [\n${entry}]\n`,
      )
    } else {
      let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      const marker = text.lastIndexOf(']')
      if (marker < 0) throw new Error('imported-puzzles.ts 格式异常：找不到结尾 ]')
      const head = text.slice(0, marker).replace(/\s+$/, '')
      text = head + '\n' + entry + text.slice(marker)
      writeFileSync(file, text)
    }
    console.log(`[import] 已写入 ${file}：${id} ${name}${unique ? '' : '（参考解为空）'}`)
    if (!unique) console.warn('[import] 未确认唯一解，条目的参考解为空；可用「显示解」让求解器现场计算')
  }
} else {
  console.log('[import] 预览模式（未写入）。加 --append 写入 src/game/imported-puzzles.ts。')
}

await browser.close()
