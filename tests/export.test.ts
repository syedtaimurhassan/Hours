import { describe, expect, it } from 'vitest'
import { srvStamp } from '../src/lib/durations'
import { shiftsToCsv } from '../src/lib/export'
import { wallToEpoch } from '../src/lib/time'
import type { Shift, Stamp } from '../src/types'

const H = 3_600_000
const MIN = 60_000
const T0 = wallToEpoch(2026, 6, 9, 9, 0)
const live = (ms: number): Stamp => ({ ms, srv: srvStamp(ms) })

function mk(partial: Partial<Shift>): Shift {
  return {
    id: 'shift',
    start: live(T0),
    end: live(T0 + 8 * H),
    jobId: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: srvStamp(T0),
    updatedAt: srvStamp(T0),
    updatedBy: 'd',
    ...partial,
  }
}

const jobName = (id: string | null) => (id === 'j1' ? 'Café' : id ? 'Other' : 'No job')

describe('shiftsToCsv', () => {
  it('emits a header and one row per shift with decimal hours', () => {
    const s = mk({
      id: 'a',
      jobId: 'j1',
      breaks: { b: { start: live(T0 + 2 * H), end: live(T0 + 2 * H + 30 * MIN) } },
    })
    const csv = shiftsToCsv([s], jobName, T0 + 9 * H)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Job,Start,End,Shift (h),Break (h),Worked (h)')
    expect(lines[1]).toBe('09-06-2026,Café,09:00,17:00,8.00,0.50,7.50')
  })

  it('labels a still-running shift end as "running"', () => {
    const csv = shiftsToCsv([mk({ id: 'r', end: null })], jobName, T0 + 3 * H)
    expect(csv.split('\r\n')[1]).toContain(',running,')
  })

  it('excludes deleted shifts and sorts oldest-first', () => {
    const later = mk({ id: 'late', start: live(T0 + 10 * H), end: live(T0 + 12 * H) })
    const early = mk({ id: 'early', start: live(T0), end: live(T0 + 2 * H) })
    const del = mk({ id: 'del', deleted: true })
    const csv = shiftsToCsv([later, del, early], jobName, T0 + 13 * H)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(3) // header + 2 (del excluded)
    expect(lines[1]).toContain('09:00') // early first
    expect(lines[2]).toContain('19:00')
  })

  it('quotes a job name containing a comma', () => {
    const csv = shiftsToCsv(
      [mk({ id: 'a', jobId: 'x' })],
      (id) => (id ? 'Shop, Downtown' : 'No job'),
      T0 + 9 * H,
    )
    expect(csv.split('\r\n')[1]).toContain('"Shop, Downtown"')
  })
})
