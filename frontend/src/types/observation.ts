/** 观测：某测点某日的读数记录 */
export interface Observation {
  id: string
  pointId: string
  /** 观测日期 YYYY-MM-DD */
  date: string
  /** 读数 */
  reading: number
  /** 累计变化（读数 − 初值） */
  cumulative: number
  /** 日速率（与上一次观测的差值 ÷ 间隔天数） */
  dailyRate: number
  observer: string
  /** 作废标记：作废记录退出累计/速率/判定计算，仅留痕 */
  voided: boolean
  /** 修正原因（编辑或作废时必填） */
  correctionReason: string
  /** 修正前读数（最近一次修正/作废前的原读数；未修正过为 null） */
  previousReading: number | null
  /** 最近一次修正/作废时间戳；未修正过为 null */
  correctedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ObservationDraft {
  pointId: string
  date: string
  reading: number
  observer: string
  /** 修正原因：仅编辑已有记录时必填 */
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

/** 编辑/作废观测后的重算与预警同步结果 */
export interface CorrectionResult {
  /** 按日期顺序重算的观测条数 */
  recalculated: number
  /** 以最新观测为准同步了级别与触发值的未闭环预警数 */
  alarmsSynced: number
  /** 修正后不再越限而被撤销的未闭环预警数 */
  alarmsRevoked: number
}
