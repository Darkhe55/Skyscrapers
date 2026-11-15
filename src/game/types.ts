/**
 * 高楼（Skyscrapers）—— 游戏专用类型
 *
 * 规则：在 n×n 中填入 1..n，每行每列不重复；盘外数字表示从该方向
 * 能看到的高楼数量（高楼挡住矮楼）。
 *
 * 状态：0 = 未填，1..n = 楼高。
 */

import type { GameState, Puzzle, ValidationResult } from '../core/types'

export interface SkyscraperPuzzle extends Puzzle {
  top: number[]
  bottom: number[]
  left: number[]
  right: number[]
  /** 题面预填格：0 = 空，1..n = 楼高 */
  givens: number[]
  solution?: number[]
}

export interface SkyscraperState extends GameState {
  cells: number[]
  givens: number[]
}

export interface DuplicateIssue {
  orientation: 'row' | 'col'
  index: number
  value: number
  cells: number[]
}

export interface ClueIssue {
  side: 'top' | 'bottom' | 'left' | 'right'
  index: number
  actual: number
  target: number
}

export interface SkyscraperResult extends ValidationResult {
  empty: number
  complete: boolean
  duplicateIssues: DuplicateIssue[]
  clueIssues: ClueIssue[]
  changedGivens: number[]
  badCells: number[]
}

export function asSkyPuzzle(p: Puzzle): SkyscraperPuzzle {
  return p as SkyscraperPuzzle
}

export function asSkyState(s: GameState): SkyscraperState {
  return s as SkyscraperState
}

export function encodeBoard(
  givens: ArrayLike<number>,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
): string {
  let givenText = ''
  for (let i = 0; i < givens.length; i++) givenText += String(givens[i]! | 0)
  return `${givenText}|${top.join(',')}|${bottom.join(',')}|${left.join(',')}|${right.join(',')}`
}

export function decodeBoard(
  text: string,
  n: number,
): { givens: number[]; top: number[]; bottom: number[]; left: number[]; right: number[] } | null {
  if (typeof text !== 'string') return null
  const parts = text.split('|')
  if (parts.length !== 5) return null
  const givenText = parts[0]!
  if (givenText.length !== n * n) return null
  const givens = new Array<number>(n * n).fill(0)
  for (let i = 0; i < n * n; i++) {
    const v = givenText.charCodeAt(i) - 48
    if (v < 0 || v > n) return null
    givens[i] = v
  }
  const parse = (s: string): number[] | null => {
    const out: number[] = []
    if (s !== '') {
      for (const part of s.split(',')) {
        const v = Number(part)
        if (!Number.isInteger(v) || v < 0 || v > n) return null
        out.push(v)
      }
    }
    return out.length === n ? out : null
  }
  const top = parse(parts[1]!)
  const bottom = parse(parts[2]!)
  const left = parse(parts[3]!)
  const right = parse(parts[4]!)
  if (!top || !bottom || !left || !right) return null
  return { givens, top, bottom, left, right }
}

export function encodeCells(cells: ArrayLike<number>): string {
  let out = ''
  for (let i = 0; i < cells.length; i++) out += String(cells[i]! | 0)
  return out
}

export function decodeCells(text: string, expected: number, n: number): number[] | null {
  if (typeof text !== 'string' || text.length !== expected) return null
  const out = new Array<number>(expected)
  for (let i = 0; i < expected; i++) {
    const v = text.charCodeAt(i) - 48
    if (v < 0 || v > n) return null
    out[i] = v
  }
  return out
}
