/** 观测状态：有效记录参与计算；作废记录留痕但不参与计算与预警判定 */
export type ObservationStatus = '有效' | '已作废'

/** 观测读数修正 / 作废留痕 */
export interface ObservationCorrection {
  type: '编辑' | '作废'
  reason: string
  readingBefore: number
  readingAfter: number | null
  correctedAt: number
}

/** 观测：某测点某日的读数记录 */
export interface Observation {
  id: string
  pointId: string
  /** 观测日期 YYYY-MM-DD */
  date: string
  /** 当前有效读数；作废后保留原读数，仅作为审计留痕 */
  reading: number
  /** 累计变化（读数 − 初值） */
  cumulative: number
  /** 日速率（与上一次观测的差值 ÷ 间隔天数） */
  dailyRate: number
  observer: string
  status: ObservationStatus
  /** 最近一次修正原因 */
  correctionReason: string
  /** 最近一次修正前读数 */
  readingBeforeCorrection: number | null
  /** 最近一次修正后读数 */
  readingAfterCorrection: number | null
  correctedAt: number | null
  correctionHistory: ObservationCorrection[]
  createdAt: number
  updatedAt: number
}

export interface ObservationDraft {
  pointId: string
  date: string
  reading: number
  observer: string
  /** 仅编辑 / 作废时填写，新增观测不需要 */
  correctionReason?: string
}

export const EMPTY_OBSERVATION_DRAFT: ObservationDraft = {
  pointId: '',
  date: '',
  reading: 0,
  observer: ''
}

/** 单测点观测序列取点 */
export interface TrendPoint {
  seq: number
  date: string
  reading: number
  cumulative: number
  dailyRate: number
}

/** 观测录入页的成组录入行 */
export interface ObservationBatchRow {
  pointId: string
  date: string
  reading: number
  observer: string
}
