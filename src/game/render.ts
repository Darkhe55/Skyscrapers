/**
 * 高楼 —— SVG 渲染与命中
 */

import type { BoardMetrics, GameState, Puzzle, ValidationResult } from '../core/types'
import { cellAtPoint, squareMetrics } from '../core/board'
import {
  asSkyPuzzle,
  asSkyState,
  type SkyscraperResult,
} from './types'

export function metricsFor(puzzle: Puzzle): BoardMetrics {
  return squareMetrics(puzzle.width, puzzle.height, {
    cell: 46,
    padLeft: 54,
    padTop: 54,
    padRight: 54,
    padBottom: 54,
    targetKind: 'cell',
  })
}

export function renderBoard(
  puzzle: Puzzle,
  state: GameState,
  result: ValidationResult,
  _colorGrid?: unknown,
): string {
  const m = metricsFor(puzzle)
  const p = asSkyPuzzle(puzzle)
  const s = asSkyState(state)
  const r = result as SkyscraperResult
  const n = puzzle.width
  const bad = new Set<number>(r.badCells ?? [])
  const badClues = new Set<string>()
  for (const issue of r.clueIssues ?? []) badClues.add(`${issue.side}-${issue.index}`)

  const cell = m.cell
  const ox = m.originX ?? m.pad
  const oy = m.originY ?? m.pad
  const gap = Math.max(1, cell * 0.04)
  const inner = cell - gap
  const parts: string[] = []

  parts.push(
    `<rect class="sk-board-bg" x="${ox - 10}" y="${oy - 10}" width="${n * cell + 20}" height="${n * cell + 20}" rx="${(cell * 0.18).toFixed(2)}" />`,
  )

  for (let i = 0; i < n * n; i++) {
    const x = ox + (i % n) * cell + gap / 2
    const y = oy + Math.floor(i / n) * cell + gap / 2
    const v = s.cells[i] ?? 0
    const given = (s.givens[i] ?? 0) !== 0
    let cls = 'sk-cell' + (bad.has(i) ? ' bad' : '') + (v === 0 ? ' empty' : ' filled')
    if (given) cls += ' given'
    let content = `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${inner.toFixed(2)}" height="${inner.toFixed(2)}" rx="${(cell * 0.1).toFixed(2)}" />`
    if (given) {
      content += `<circle class="sk-given-ring" cx="${(x + inner / 2).toFixed(2)}" cy="${(y + inner / 2).toFixed(2)}" r="${(inner * 0.42).toFixed(2)}" />`
    }
    if (v !== 0) {
      content += `<text class="sk-value" x="${(x + inner / 2).toFixed(2)}" y="${(y + inner / 2 + cell * 0.02).toFixed(2)}" style="font-size:${(cell * 0.42).toFixed(2)}px">${v}</text>`
    }
    if (bad.has(i)) {
      content += `<rect class="sk-error" x="${(x + 1.1).toFixed(2)}" y="${(y + 1.1).toFixed(2)}" width="${(inner - 2.2).toFixed(2)}" height="${(inner - 2.2).toFixed(2)}" rx="${(cell * 0.1).toFixed(2)}" />`
    }
    parts.push(`<g data-index="${i}">${content}</g>`)
  }

  const labels: string[] = []
  const clueAt = (side: string, index: number, text: string, x: number, y: number): void => {
    const issue = badClues.has(`${side}-${index}`) ? ' issue' : ''
    labels.push(
      `<text class="sk-clue${issue}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" style="font-size:${(cell * 0.34).toFixed(2)}px">${text}</text>`,
    )
  }
  for (let x = 0; x < n; x++) {
    const top = p.top[x] ?? 0
    const bottom = p.bottom[x] ?? 0
    if (top > 0) clueAt('top', x, String(top), ox + x * cell + cell / 2, oy - 14)
    if (bottom > 0) clueAt('bottom', x, String(bottom), ox + x * cell + cell / 2, oy + n * cell + 20)
  }
  for (let y = 0; y < n; y++) {
    const left = p.left[y] ?? 0
    const right = p.right[y] ?? 0
    if (left > 0) clueAt('left', y, String(left), ox - 16, oy + y * cell + cell / 2)
    if (right > 0) clueAt('right', y, String(right), ox + n * cell + 16, oy + y * cell + cell / 2)
  }
  parts.push(`<g class="sk-clues">${labels.join('')}</g>`)

  for (let i = 0; i < n * n; i++) {
    const x = ox + (i % n) * cell
    const y = oy + Math.floor(i / n) * cell
    parts.push(
      `<rect class="cell-hit" data-index="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`,
    )
  }

  return `<svg class="board-svg sk-board" viewBox="0 0 ${m.svgWidth} ${m.svgHeight}" width="${m.svgWidth}" height="${m.svgHeight}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

export function hitTest(
  m: BoardMetrics,
  _puzzle: Puzzle,
  x: number,
  y: number,
): { index: number } | null {
  const index = cellAtPoint(m, x, y)
  return index == null ? null : { index }
}
