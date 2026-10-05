/**
 * /observations 位移 / 浸润线观测录入
 * 按日期与测点类型成组录入读数，录入即与阈值比对并给出预警级别，可直接生成预警单。
 * 消费 Observation、Point；复用 <FilterBar>、<AlarmTag>、<EmptyPanel>、<StatBadge>。
 */
import { useMemo, useState } from 'react'
import { App as AntdApp, Button, Form, Input, InputNumber, Modal, Space, Table, Tag, Tooltip } from 'antd'
import type { TableColumnsType } from 'antd'
import AlarmTag from '@/components/common/AlarmTag'
import EmptyPanel from '@/components/common/EmptyPanel'
import FilterBar, { type FilterModel } from '@/components/common/FilterBar'
import StatBadge from '@/components/common/StatBadge'
import { useDamStore } from '@/stores/damStore'
import { exportObservationCsv } from '@/utils/export'
import { usePointStore } from '@/stores/pointStore'
import { useAlarmStore } from '@/stores/alarmStore'
import { useAlarmLevel } from '@/hooks/useAlarmLevel'
import { useIdbTable } from '@/hooks/useIdbTable'
import { correctObservation, createObservation, db, voidObservation, type ObservationRow } from '@/utils/db'
import { POINT_TYPES, type Point, type PointType } from '@/types/point'
import type { ObservationDraft } from '@/types/observation'

export default function ObservationEntry() {
  const { message } = AntdApp.useApp()
  const damStore = useDamStore()
  const pointStore = usePointStore()
  const alarmStore = useAlarmStore()
  const alarmLevel = useAlarmLevel()
  const observationTable = useIdbTable<ObservationRow>(db.observations, { sortByUpdatedAt: false })

  const [form] = Form.useForm<ObservationDraft>()
  const [voidForm] = Form.useForm<{ correctionReason: string }>()
  const [open, setOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<ObservationRow | null>(null)

  const filter = pointStore.filter
  const filterSelects = useMemo(
    () => [
      {
        key: 'damId',
        label: '坝体',
        multiple: false,
        options: damStore.dams.map((dam) => ({ label: dam.name, value: dam.id }))
      },
      { key: 'types', label: '测点类型', options: POINT_TYPES.map((item) => ({ label: item, value: item })) }
    ],
    [damStore.dams]
  )

  const model: FilterModel = { keyword: filter.keyword, damId: filter.damId, types: filter.types }

  const onModelChange = (next: FilterModel): void => {
    pointStore.patchFilter({
      keyword: String(next.keyword ?? ''),
      damId: typeof next.damId === 'string' ? next.damId : '',
      types: (Array.isArray(next.types) ? next.types : []) as PointType[]
    })
  }

  const candidates = pointStore.points.filter((point) => {
    if (filter.damId && point.damId !== filter.damId) return false
    if (filter.types.length > 0 && !filter.types.includes(point.type)) return false
    const text = filter.keyword.trim().toLowerCase()
    if (text.length === 0) return true
    return point.code.toLowerCase().includes(text)
  })

  const activePointId = pointStore.selectedIds[0] ?? null
  const activePoint = activePointId ? pointStore.points.find((point) => point.id === activePointId) ?? null : null

  const activeObservationRows = useMemo(
    () => observationTable.rows.filter((row) => row.status !== '已作废'),
    [observationTable.rows]
  )

  const observationsOfActive = useMemo(
    () =>
      observationTable.rows
        .filter((row) => row.pointId === activePointId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [observationTable.rows, activePointId]
  )

  const draftReading = Form.useWatch('reading', form)
  const draftDate = Form.useWatch('date', form)
  const preview =
    activePoint && typeof draftReading === 'number'
      ? alarmLevel.evaluate(activePoint, draftReading)
      : null

  const openCreate = (): void => {
    if (!activePoint) {
      message.warning('请先在左侧选择一个测点')
      return
    }
    setEditingId(null)
    const latest = activeObservationRows
      .filter((row) => row.pointId === activePoint.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    form.setFieldsValue({
      pointId: activePoint.id,
      date: new Date().toISOString().slice(0, 10),
      reading: latest ? latest.reading : activePoint.initialValue,
      observer: '',
      correctionReason: ''
    })
    setOpen(true)
  }

  const openEdit = (row: ObservationRow): void => {
    setEditingId(row.id)
    form.setFieldsValue({
      pointId: row.pointId,
      date: row.date,
      reading: row.reading,
      observer: row.observer,
      correctionReason: ''
    })
    setOpen(true)
  }

  const submit = async (): Promise<void> => {
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    // pointId 由隐藏字段注册进表单；这里再兜底一次，并给出可读提示，避免写库失败时无任何反馈
    const pointId = values.pointId ?? activePoint?.id ?? ''
    if (!pointId) {
      message.error('未选择测点，无法保存观测记录')
      return
    }
    const now = Date.now()
    try {
      if (editingId) {
        await correctObservation(editingId, {
          date: values.date,
          reading: Number(values.reading) || 0,
          observer: values.observer.trim() || '未署名',
          reason: values.correctionReason?.trim() ?? ''
        })
      } else {
        await createObservation({
          id: `ob_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          pointId,
          date: values.date,
          reading: Number(values.reading) || 0,
          observer: values.observer.trim() || '未署名',
          createdAt: now,
          updatedAt: now
        })
      }
    } catch (error) {
      message.error(`观测保存失败：${error instanceof Error ? error.message : '未知错误'}`)
      return
    }
    message.success(editingId ? '观测记录已修正，全部观测与未闭环预警已同步重算' : '观测已录入，累计量与日速率已自动计算')
    setOpen(false)
  }

  const openVoid = (row: ObservationRow): void => {
    if (row.status === '已作废') return
    setVoidTarget(row)
    voidForm.setFieldsValue({ correctionReason: '' })
    setVoidOpen(true)
  }

  const submitVoid = async (): Promise<void> => {
    const values = await voidForm.validateFields().catch(() => null)
    if (!values || !voidTarget) return
    try {
      await voidObservation(voidTarget.id, values.correctionReason)
    } catch (error) {
      message.error(`观测作废失败：${error instanceof Error ? error.message : '未知错误'}`)
      return
    }
    message.success('观测记录已作废，全部观测与未闭环预警已同步重算')
    setVoidOpen(false)
    setVoidTarget(null)
  }

  const generateAlarm = async (): Promise<void> => {
    if (!activePoint) {
      message.info('请先在左侧选择一个测点')
      return
    }
    if (!preview) {
      message.info('请先点击「录入观测」并填写读数，越限后可生成预警单')
      return
    }
    if (preview.level === null) {
      message.info('当前读数未越限，无需生成预警单')
      return
    }
    const result = alarmLevel.buildDraft(activePoint, draftDate || new Date().toISOString().slice(0, 10), Number(draftReading))
    if (!result) return
    await alarmStore.createAlarm({ ...result.draft, measure: result.basis })
    message.success(`已生成${result.draft.level}色预警单`)
  }

  const exportCsv = (): void => {
    const filename = exportObservationCsv(damStore.dams, damStore.sections, pointStore.points, observationTable.rows)
    message.success(`已导出观测台账 ${filename}`)
  }

  const columns: TableColumnsType<ObservationRow> = [
    { title: '日期', dataIndex: 'date', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: ObservationRow['status']) => <Tag color={value === '已作废' ? 'red' : 'green'}>{value}</Tag>
    },
    {
      title: '读数',
      dataIndex: 'reading',
      width: 120,
      render: (value: number, record) => <span className={record.status === '已作废' ? 'muted' : undefined}>{value.toFixed(3)}</span>
    },
    {
      title: '累计变化',
      dataIndex: 'cumulative',
      width: 130,
      render: (value: number, record) =>
        record.status === '已作废' ? (
          <span className="muted">—</span>
        ) : (
          <span style={{ color: value >= 0 ? '#b03a2e' : '#2f7a4f' }}>{value.toFixed(3)}</span>
        )
    },
    {
      title: '日速率',
      dataIndex: 'dailyRate',
      width: 120,
      render: (value: number, record) => (record.status === '已作废' ? <span className="muted">—</span> : value.toFixed(4))
    },
    {
      title: '判定',
      width: 150,
      render: (_value, record) => {
        if (record.status === '已作废') return <span className="muted">不参与判定</span>
        const point = pointStore.points.find((item) => item.id === record.pointId)
        if (!point) return <span className="muted">测点已删除</span>
        const level = alarmLevel.evaluate(point, record.reading).level
        return level ? <AlarmTag level={level} size="small" /> : <Tag color="green">正常</Tag>
      }
    },
    { title: '观测人', dataIndex: 'observer', width: 100 },
    {
      title: '修正原因 / 前后读数',
      width: 260,
      render: (_value, record) => {
        if (!record.correctionReason) return <span className="muted">—</span>
        const history = (
          <div style={{ maxWidth: 320 }}>
            {record.correctionHistory.map((item, index) => (
              <div key={index} style={{ marginBottom: 6 }}>
                <div>
                  {item.type} · {new Date(item.correctedAt).toLocaleString('zh-CN')}
                </div>
                <div>原因：{item.reason}</div>
                <div>
                  读数：{item.readingBefore.toFixed(3)} → {item.readingAfter === null ? '作废' : item.readingAfter.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        )
        return (
          <Tooltip title={history} placement="topLeft">
            <div>
              <Tag color={record.status === '已作废' ? 'red' : 'orange'}>
                {record.correctionHistory.at(-1)?.type ?? '修正'}
              </Tag>
              <span>{record.correctionReason}</span>
              <div className="muted">
                {record.readingBeforeCorrection?.toFixed(3) ?? '—'} → {record.readingAfterCorrection?.toFixed(3) ?? '—'}
              </div>
            </div>
          </Tooltip>
        )
      }
    },
    {
      title: '操作',
      width: 120,
      render: (_value, record) => (
        <Space size={4}>
          <Button type="link" size="small" disabled={record.status === '已作废'} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" danger disabled={record.status === '已作废'} onClick={() => openVoid(record)}>
            作废
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="page-head__title">位移 / 浸润线观测录入</h2>
          <p className="page-head__desc">
            选定测点后按日期录入读数，系统自动与初值比对算累计量与日速率，越限可直接生成预警单。
          </p>
        </div>
        <div className="page-head__actions">
          {/* 「生成预警单」已移入录入观测弹窗 footer：读数草稿只在弹窗内存在，页面头部按钮无法被点击（被弹窗遮罩拦截） */}
          <Button onClick={exportCsv}>导出 CSV</Button>
          <Button type="primary" disabled={!activePoint} onClick={openCreate}>
            录入观测
          </Button>
        </div>
      </div>

      <div className="stat-row">
        <StatBadge label="观测记录" value={observationTable.rows.length} suffix="条" tone="primary" />
        <StatBadge label="已观测测点" value={new Set(activeObservationRows.map((row) => row.pointId)).size} suffix="个" tone="info" />
        <StatBadge label="预警单总数" value={alarmStore.alarms.length} suffix="张" tone="warning" />
        <StatBadge label="待处置预警" value={alarmStore.counts()['待处置']} suffix="张" tone="danger" />
      </div>

      <FilterBar
        model={model}
        selects={filterSelects}
        keywordPlaceholder="搜索测点编号"
        onModelChange={onModelChange}
      />

      <div className="grid-two" style={{ marginTop: 16 }}>
        <div className="panel">
          <h3 className="panel-title">测点列表（{candidates.length}）</h3>
          {candidates.length === 0 ? (
            <EmptyPanel title="没有可录入的测点" description="先到测点配置页布设测点与阈值。" compact />
          ) : (
            candidates.map((point: Point) => {
              const pointRows = activeObservationRows.filter((row) => row.pointId === point.id)
              const latest = pointRows.sort((a, b) => b.date.localeCompare(a.date))[0]
              const level = latest ? alarmLevel.evaluate(point, latest.reading).level : null
              return (
                <div
                  key={point.id}
                  className={`card-list-item${point.id === activePointId ? ' is-active' : ''}`}
                  onClick={() => pointStore.setSelectedIds([point.id])}
                >
                  <div className="card-list-item__head">
                    <span>{point.code}</span>
                    {level ? <AlarmTag level={level} size="small" /> : <Tag color="green">正常</Tag>}
                  </div>
                  <div className="card-list-item__meta">
                    <span>{point.type}</span>
                    <span>· 阈值 {point.threshold} {point.unit}</span>
                    <span>· 有效观测 {activeObservationRows.filter((row) => row.pointId === point.id).length} 次</span>
                  </div>
                  <div className="card-list-item__meta">
                    <span>最新：{latest ? `${latest.date} ${latest.reading.toFixed(3)} ${point.unit}` : '暂无观测'}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="panel">
          {activePoint ? (
            <>
              <div className="panel-head">
                <h3 className="panel-title" style={{ margin: 0 }}>
                  {activePoint.code} · 观测明细
                  <span className="muted">
                    {' '}
                    {activePoint.type} · 初值 {activePoint.initialValue} {activePoint.unit} · 阈值 {activePoint.threshold}{' '}
                    {activePoint.unit}
                  </span>
                </h3>
                <Button size="small" type="primary" onClick={openCreate}>
                  录入观测
                </Button>
              </div>
              {observationsOfActive.length === 0 ? (
                <EmptyPanel
                  title="该测点暂无观测记录"
                  description="点击「录入观测」登记第一条读数。"
                  actionText="录入观测"
                  onAction={openCreate}
                  compact
                />
              ) : (
                <Table<ObservationRow>
                  rowKey="id"
                  size="small"
                  bordered
                  dataSource={observationsOfActive}
                  columns={columns}
                  pagination={false}
                  scroll={{ x: 1350 }}
                />
              )}
            </>
          ) : (
            <EmptyPanel title="尚未选择测点" description="在左侧测点列表中选择一个测点后即可录入观测读数。" compact />
          )}
        </div>
      </div>

      <Modal
        open={open}
        title={editingId ? '编辑观测记录' : `录入观测${activePoint ? ` · ${activePoint.code}` : ''}`}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            {/* 读数草稿只在弹窗内存在，因此越限生成预警单必须与读数同屏可用 */}
            <Button onClick={generateAlarm} disabled={editingId !== null || !preview || preview.level === null}>
              生成预警单
            </Button>
            <Button type="primary" onClick={submit}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {/* 隐藏字段：把当前测点注册进表单，保证 validateFields() 能取回 pointId */}
          <Form.Item name="pointId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="date" label="观测日期" rules={[{ required: true, message: '请填写观测日期' }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="reading" label="读数" rules={[{ required: true, message: '请填写读数' }]}>
            <InputNumber step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="observer" label="观测人" rules={[{ required: true, message: '请填写观测人' }]}>
            <Input placeholder="如 刘振国" />
          </Form.Item>
          {editingId ? (
            <Form.Item
              name="correctionReason"
              label="修正原因"
              rules={[{ required: true, whitespace: true, message: '请填写修正原因' }, { min: 2, message: '修正原因至少 2 个字' }]}
              extra="保存后会按日期顺序重算该测点全部观测，并同步未闭环预警。"
            >
              <Input.TextArea rows={3} placeholder="请说明读数录错的原因及修正依据" />
            </Form.Item>
          ) : null}
          {preview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="muted">
                累计变化 {preview.cumulative.toFixed(3)} · 占阈值 {(preview.ratio * 100).toFixed(1)}%
              </span>
              {preview.level ? <AlarmTag level={preview.level} /> : <Tag color="green">正常</Tag>}
            </div>
          ) : null}
        </Form>
      </Modal>

      <Modal
        open={voidOpen}
        title="作废观测记录"
        onCancel={() => {
          setVoidOpen(false)
          setVoidTarget(null)
        }}
        onOk={submitVoid}
        okText="确认作废"
        cancelText="取消"
        destroyOnClose
      >
        {voidTarget ? (
          <div className="muted" style={{ marginBottom: 12 }}>
            将作废 {voidTarget.date} 读数 {voidTarget.reading.toFixed(3)}。作废后记录仍保留，但不参与累计变化、日速率及预警计算。
          </div>
        ) : null}
        <Form form={voidForm} layout="vertical">
          <Form.Item
            name="correctionReason"
            label="作废原因"
            rules={[{ required: true, whitespace: true, message: '请填写作废原因' }, { min: 2, message: '作废原因至少 2 个字' }]}
          >
            <Input.TextArea rows={3} placeholder="请说明作废原因及依据" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
