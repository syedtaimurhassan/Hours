/**
 * Editor validation (§ design 4.4). The pure rules live in validateDraft();
 * the cross-shift overlap check runs a dedicated save-time range query whose
 * window derives from the EDITED shift's times (never from whatever period
 * History happens to have loaded). All comparisons are epoch math — never
 * wall-clock strings — so the fall-back false-overlap pair passes.
 */
import type { Shift } from '../types'
import { effectiveEndMs } from './durations'
import {
  MAX_SHIFT_MS,
  LONG_SHIFT_WARN_MS,
  formatDuration,
  resolveMs,
} from './time'

export type BreakDraft = { id: string; startMs: number | null; endMs: number | null }

export type ShiftDraft = {
  startMs: number | null // null = incomplete picker input
  /** 'ongoing' keeps a running shift running. */
  end: number | 'ongoing' | null
  breaks: BreakDraft[]
}

export type ValidationResult = {
  /** Field-level errors; Save stays disabled while any exist. */
  errors: {
    start?: string
    end?: string
    /** Keyed by break id. */
    breaks: Record<string, string>
    form?: string
  }
  /** Non-blocking amber notice (>16 h shift). */
  warning: string | null
  /** Set when end ≤ start looks like a missed overnight — UI offers a
   * one-tap "Ended the next day?" fix. */
  suggestOvernight: boolean
  valid: boolean
}

const FUTURE_START_SLACK_MS = 5 * 60_000
const FUTURE_END_SLACK_MS = 60_000

export function validateDraft(
  draft: ShiftDraft,
  opts: { nowMs: number; isActive: boolean },
): ValidationResult {
  const errors: ValidationResult['errors'] = { breaks: {} }
  let warning: string | null = null
  let suggestOvernight = false

  if (draft.startMs === null) {
    errors.start = 'Enter a date and time.'
  } else if (draft.startMs > opts.nowMs + FUTURE_START_SLACK_MS) {
    errors.start = 'Start time is in the future.'
  }

  if (draft.end === null) {
    errors.end = 'Enter a date and time.'
  } else if (draft.end === 'ongoing') {
    if (!opts.isActive) errors.end = 'Enter a date and time.'
  } else {
    if (draft.end > opts.nowMs + FUTURE_END_SLACK_MS) {
      errors.end = 'End time is in the future.'
    }
    if (draft.startMs !== null && !errors.end) {
      if (draft.end <= draft.startMs) {
        errors.end = 'End must be after start.'
        // A same-date end *time* before the start time is usually a missed
        // overnight — offer the next-day fix instead of just blocking.
        if (draft.startMs - draft.end < 24 * 3_600_000) suggestOvernight = true
      } else {
        const duration = draft.end - draft.startMs
        if (duration >= MAX_SHIFT_MS) {
          errors.end =
            'Shifts must be under 24 hours — split this into two shifts.'
        } else if (duration > LONG_SHIFT_WARN_MS) {
          warning = `This shift is ${formatDuration(duration)} — is that right?`
        }
      }
    }
  }

  // Breaks validate against [start, endBound]; for a still-running shift the
  // bound is now.
  const endBound =
    draft.end === 'ongoing' || draft.end === null ? opts.nowMs : draft.end
  const closed: { id: string; startMs: number; endMs: number }[] = []
  for (const b of draft.breaks) {
    if (b.startMs === null || b.endMs === null) {
      errors.breaks[b.id] = 'Enter a date and time.'
      continue
    }
    if (b.endMs <= b.startMs) {
      errors.breaks[b.id] = 'Break end must be after its start.'
      continue
    }
    if (
      draft.startMs !== null &&
      (b.startMs < draft.startMs || b.endMs > endBound)
    ) {
      errors.breaks[b.id] = 'Break is outside the shift.'
      continue
    }
    closed.push({ id: b.id, startMs: b.startMs, endMs: b.endMs })
  }
  closed.sort((a, b) => a.startMs - b.startMs)
  for (let i = 1; i < closed.length; i++) {
    if (closed[i].startMs < closed[i - 1].endMs) {
      errors.breaks[closed[i].id] = `Overlaps another break.`
    }
  }
  if (
    draft.startMs !== null &&
    typeof draft.end === 'number' &&
    draft.end > draft.startMs
  ) {
    const unioned = unionMs(closed)
    if (unioned >= draft.end - draft.startMs) {
      errors.form = 'Breaks cover the whole shift.'
    }
  }

  const valid =
    !errors.start &&
    !errors.end &&
    !errors.form &&
    Object.keys(errors.breaks).length === 0
  return { errors, warning, suggestOvernight, valid }
}

function unionMs(
  intervals: { startMs: number; endMs: number }[],
): number {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs)
  let total = 0
  let curStart = 0
  let curEnd = -Infinity
  for (const iv of sorted) {
    if (iv.startMs > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart
      curStart = iv.startMs
      curEnd = iv.endMs
    } else {
      curEnd = Math.max(curEnd, iv.endMs)
    }
  }
  if (curEnd > curStart) total += curEnd - curStart
  return total
}

export type OverlapHit = { shiftId: string; startMs: number; endMs: number }

/** Pure intersection check used by both the query path and tests. */
export function findOverlapIn(
  candidates: Shift[],
  draft: { startMs: number; endMs: number },
  excludeShiftId: string | null,
  nowMs: number,
): OverlapHit | null {
  for (const s of candidates) {
    if (s.deleted || s.id === excludeShiftId) continue
    const sStart = resolveMs(s.start)
    const sEnd = effectiveEndMs(s) ?? nowMs
    if (sEnd <= sStart) continue // bad-times records can't block edits
    if (draft.startMs < sEnd && sStart < draft.endMs) {
      return { shiftId: s.id, startMs: sStart, endMs: sEnd }
    }
  }
  return null
}
