/**
 * 观测修正留痕：作废 / 已修正标记、修正前后读数与修正原因。
 * 被观测录入明细、速率计算抽屉两页消费。
 */
import { Tag } from 'antd'
import type { Observation } from '@/types/observation'

function formatDate(ts: number): string {
  const date = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function CorrectionInfo({ observation }: { observation: Observation }) {
  if (observation.voided) {
    return (
      <div>
        <Tag color="red">已作废</Tag>
        <div className="muted">
          原读数 {observation.previousReading ?? observation.reading}
          {observation.correctedAt !== null ? ` · ${formatDate(observation.correctedAt)}` : ''}
        </div>
        <div style={{ fontSize: 12 }}>{observation.correctionReason}</div>
      </div>
    )
  }
  if (observation.correctedAt !== null) {
    return (
      <div>
        <Tag color="orange">已修正</Tag>
        <div className="muted">
          {observation.previousReading ?? '—'} → {observation.reading} · {formatDate(observation.correctedAt)}
        </div>
        <div style={{ fontSize: 12 }}>{observation.correctionReason}</div>
      </div>
    )
  }
  return <span className="muted">—</span>
}
