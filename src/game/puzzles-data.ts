/* 自动生成，勿手改。运行 npm run gen 重新生成。 */
export interface RawPuzzle {
  id: string
  name: string
  width: number
  height: number
  difficulty: 'easy' | 'medium' | 'hard' | 'custom'
  series: string
  /** 题面编码串（格式由 src/game/puzzles.ts 解析） */
  board: string
  /** 参考解编码串（没有则留空） */
  solution?: string
}

export const RAW_PUZZLES: RawPuzzle[] = [
  { id: "skyscrapers-4x4-n404xt", name: "初识高楼", width: 4, height: 4, difficulty: 'easy', series: "入门", board: "0000000000000000|3,2,2,1|2,3,1,2|3,2,1,3|1,2,4,2", solution: "2134341243211243" },
  { id: "skyscrapers-5x5-n404xu", name: "五街天际", width: 5, height: 5, difficulty: 'easy', series: "入门", board: "0000000000000000000000000|3,2,2,1,2|2,2,3,3,1|2,2,3,1,3|2,3,3,3,1", solution: "3125445132235415241314325" },
  { id: "skyscrapers-5x5-n404xv", name: "楼影回廊", width: 5, height: 5, difficulty: 'medium', series: "进阶", board: "0000000000000000000000000|4,2,3,1,4|2,3,3,3,1|3,2,2,1,2|2,3,2,3,1", solution: "1435225413315245324142135" },
  { id: "skyscrapers-6x6-n404xw", name: "六城视界", width: 6, height: 6, difficulty: 'medium', series: "进阶", board: "060541050200610300340165120436030624|3,1,2,2,3,4|2,4,3,1,3,2|2,3,1,3,4,2|4,2,3,2,1,2", solution: "263541456213614352342165125436531624" },
  { id: "skyscrapers-6x6-n404xx", name: "高楼迷阵", width: 6, height: 6, difficulty: 'hard', series: "挑战", board: "000001000006000400045030000000000000|2,3,1,2,3,2|2,3,4,2,1,3|2,3,2,1,2,2|4,1,3,4,2,2", solution: "326541254316162453645132413625531264" },
  { id: "skyscrapers-6x6-n404xy", name: "天际终局", width: 6, height: 6, difficulty: 'hard', series: "挑战", board: "000526040130051300000005605000000000|3,4,2,2,3,1|2,1,3,2,2,3|4,2,3,2,1,2|1,3,2,2,4,3", solution: "314526546132251364423615635241162453" },
]
