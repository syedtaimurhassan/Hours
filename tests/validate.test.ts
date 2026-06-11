import { describe, expect, it } from 'vitest'
import { srvStamp } from '../src/lib/durations'
import { wallToEpoch } from '../src/lib/time'
import {
  findOverlapIn,
  validateDraft,
  type ShiftDraft,
} from '../src/lib/validate'
import type { Shift, Stamp } from '../src/types'

const H = 3_600_000
const MIN = 60_000
const T0 = wallToEpoch(2026, 6, 9, 9, 0) // Tue 09-06-2026 09:00 DK
const NOW = wallToEpoch(2026, 6, 10, 12, 0)

const live = (ms: number): Stamp => ({ ms, srv: srvStamp(ms) })

function mkShift(id: string, startMs: number, endMs: number | null): Shift {
  return {
    id,
    start: live(startMs),
    end: endMs === null ? null : live(endMs),
    jobId: null,
    stopClaims: {},
    breaks: {},
    deleted: false,
    deletedAtMs: null,
    createdAt: srvStamp(startMs),
    updatedAt: srvStamp(startMs),
    updatedBy: 'devA',
  }
}

const draft = (partial: Partial<ShiftDraft>): ShiftDraft => ({
  startMs: T0,
  end: T0 + 8 * H,
  breaks: [],
  ...partial,
})

describe('validateDraft — ordering and future rules', () => {
  it('accepts a normal shift', () => {
    const r = validateDraft(draft({}), { nowMs: NOW, isActive: false })
    expect(r.valid).toBe(true)
    expect(r.warning).toBeNull()
  })

  it('rejects empty fields', () => {
    const r = validateDraft(draft({ startMs: null, end: null }), {
      nowMs: NOW,
      isActive: false,
    })
    expect(r.errors.start).toBe('Enter a date and time.')
    expect(r.errors.end).toBe('Enter a date and time.')
    expect(r.valid).toBe(false)
  })

  it('end ≤ start blocks and suggests the overnight fix', () => {
    // 17:00 start, 08:00 "end" same day — classic missed overnight
    const start = wallToEpoch(2026, 6, 9, 17, 0)
    const end = wallToEpoch(2026, 6, 9, 8, 0)
    const r = validateDraft(draft({ startMs: start, end }), {
      nowMs: NOW,
      isActive: false,
    })
    expect(r.errors.end).toBe('End must be after start.')
    expect(r.suggestOvernight).toBe(true)
  })

  it('legitimate overnight shift passes (never blocked)', () => {
    const start = wallToEpoch(2026, 6, 8, 22, 0)
    const end = wallToEpoch(2026, 6, 9, 3, 30)
    const r = validateDraft(draft({ startMs: start, end }), {
      nowMs: NOW,
      isActive: false,
    })
    expect(r.valid).toBe(true)
  })

  it('end in the future blocks', () => {
    const r = validateDraft(draft({ end: NOW + 10 * MIN }), {
      nowMs: NOW,
      isActive: false,
    })
    expect(r.errors.end).toBe('End time is in the future.')
  })

  it('start more than 5 min in the future blocks', () => {
    const r = validateDraft(
      draft({ startMs: NOW + 6 * MIN, end: 'ongoing' }),
      { nowMs: NOW, isActive: true },
    )
    expect(r.errors.start).toBe('Start time is in the future.')
  })

  it('>16 h warns without blocking; ≥24 h hard-blocks', () => {
    const warn = validateDraft(draft({ end: T0 + 18 * H + 30 * MIN }), {
      nowMs: T0 + 19 * H,
      isActive: false,
    })
    expect(warn.valid).toBe(true)
    expect(warn.warning).toBe('This shift is 18 h 30 m — is that right?')

    const block = validateDraft(draft({ end: T0 + 24 * H }), {
      nowMs: T0 + 25 * H,
      isActive: false,
    })
    expect(block.errors.end).toBe(
      'Shifts must be under 24 hours — split this into two shifts.',
    )
  })

  it("'ongoing' end is only valid for the active shift", () => {
    expect(
      validateDraft(draft({ end: 'ongoing' }), { nowMs: NOW, isActive: true })
        .valid,
    ).toBe(true)
    expect(
      validateDraft(draft({ end: 'ongoing' }), { nowMs: NOW, isActive: false })
        .errors.end,
    ).toBe('Enter a date and time.')
  })
})

describe('validateDraft — break rules', () => {
  it('break outside the shift blocks', () => {
    const r = validateDraft(
      draft({
        breaks: [{ id: 'b1', startMs: T0 - H, endMs: T0 + H }],
      }),
      { nowMs: NOW, isActive: false },
    )
    expect(r.errors.breaks.b1).toBe('Break is outside the shift.')
  })

  it('break end ≤ break start blocks', () => {
    const r = validateDraft(
      draft({ breaks: [{ id: 'b1', startMs: T0 + 2 * H, endMs: T0 + 2 * H }] }),
      { nowMs: NOW, isActive: false },
    )
    expect(r.errors.breaks.b1).toBe('Break end must be after its start.')
  })

  it('overlapping breaks block the later one', () => {
    const r = validateDraft(
      draft({
        breaks: [
          { id: 'b1', startMs: T0 + 2 * H, endMs: T0 + 3 * H },
          { id: 'b2', startMs: T0 + 2 * H + 30 * MIN, endMs: T0 + 4 * H },
        ],
      }),
      { nowMs: NOW, isActive: false },
    )
    expect(r.errors.breaks.b2).toBe('Overlaps another break.')
    expect(r.errors.breaks.b1).toBeUndefined()
  })

  it('breaks covering the whole shift block the form', () => {
    const r = validateDraft(
      draft({
        end: T0 + 2 * H,
        breaks: [{ id: 'b1', startMs: T0, endMs: T0 + 2 * H }],
      }),
      { nowMs: NOW, isActive: false },
    )
    expect(r.errors.form).toBe('Breaks cover the whole shift.')
  })

  it('break on a running shift validates against now', () => {
    const r = validateDraft(
      draft({
        startMs: NOW - 3 * H,
        end: 'ongoing',
        breaks: [{ id: 'b1', startMs: NOW - H, endMs: NOW + H }],
      }),
      { nowMs: NOW, isActive: true },
    )
    expect(r.errors.breaks.b1).toBe('Break is outside the shift.')
  })
})

describe('findOverlapIn — epoch math, never wall-clock strings', () => {
  it('detects a plain overlap and reports the blocking shift', () => {
    const existing = mkShift('x', T0 + 8 * H, T0 + 10 * H) // 17:00–19:00
    const hit = findOverlapIn(
      [existing],
      { startMs: T0 + 5 * H, endMs: T0 + 9 * H }, // 14:00–18:00
      null,
      NOW,
    )
    expect(hit?.shiftId).toBe('x')
  })

  it('touching boundaries (end == next start) do NOT overlap', () => {
    const existing = mkShift('x', T0 + 8 * H, T0 + 10 * H)
    expect(
      findOverlapIn(
        [existing],
        { startMs: T0 + 4 * H, endMs: T0 + 8 * H },
        null,
        NOW,
      ),
    ).toBeNull()
  })

  it('the edited shift itself is excluded', () => {
    const existing = mkShift('x', T0, T0 + 8 * H)
    expect(
      findOverlapIn([existing], { startMs: T0, endMs: T0 + 8 * H }, 'x', NOW),
    ).toBeNull()
  })

  it('a RUNNING shift blocks overlapping edits up to now', () => {
    const running = mkShift('r', NOW - 2 * H, null)
    const hit = findOverlapIn(
      [running],
      { startMs: NOW - H, endMs: NOW - 30 * MIN },
      null,
      NOW,
    )
    expect(hit?.shiftId).toBe('r')
  })

  it('deleted and bad-times shifts never block', () => {
    const del = { ...mkShift('d', T0, T0 + 8 * H), deleted: true }
    const bad = mkShift('b', T0 + 8 * H, T0) // end before start
    expect(
      findOverlapIn([del, bad], { startMs: T0, endMs: T0 + 8 * H }, null, NOW),
    ).toBeNull()
  })

  it('fall-back false-overlap pair passes: sequential in real time', () => {
    // 2026-10-25 Copenhagen: 01:30–02:30 CEST then 02:15–03:00 CET LOOK
    // overlapping in wall-clock terms but are sequential in epoch terms.
    const aStart = Date.UTC(2026, 9, 24, 23, 30) // 01:30 CEST
    const aEnd = Date.UTC(2026, 9, 25, 0, 30) // 02:30 CEST
    const bStart = Date.UTC(2026, 9, 25, 1, 15) // 02:15 CET
    const bEnd = Date.UTC(2026, 9, 25, 2, 0) // 03:00 CET
    const existing = mkShift('a', aStart, aEnd)
    expect(
      findOverlapIn([existing], { startMs: bStart, endMs: bEnd }, null, NOW),
    ).toBeNull()
  })
})
