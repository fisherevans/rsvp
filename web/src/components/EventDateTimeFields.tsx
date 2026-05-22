// EventDateTimeFields is the start+end picker shared between Create and Edit.
//
// UX:
//   - Start: DatePicker + TimePicker (defaults: today @ noon)
//   - End: TimePicker only (assumed same day as start); a "Multi-day event"
//     link reveals a DatePicker for the end so you can extend to a later day.
//   - "Don't show end time" toggle: hides the end pickers and reveals an
//     "End condition" text input shown to attendees in place of an end time.
//     The end timestamp is still saved (calendar invites need it) - we just
//     hide it from the public display.
//
// All state is reflected up through onChange. Parent owns ISO strings + tz.

import { useEffect, useState } from 'react'
import { DatePicker, TimePicker } from './DateTimePicker'
import { TimezoneInline } from './TimezoneInline'
import type { DateComponents } from '../lib/datetime'
import { componentsFromISO, componentsToISO } from '../lib/datetime'

export type DateTimeValue = {
    startsAt: string
    endsAt: string
    allDay: boolean
    endTimeHidden: boolean
    endCondition: string | null
}

export function EventDateTimeFields({
    value,
    timezone,
    onChange,
    onTimezoneChange,
}: {
    value: DateTimeValue
    timezone: string
    onChange: (next: DateTimeValue) => void
    onTimezoneChange?: (tz: string) => void
}) {
    const tz = timezone || 'UTC'
    // Translate between ISO (the contract with the parent) and components
    // (what the pickers want). When tz changes the components recalculate.
    const [start, setStart] = useState<DateComponents>(() => componentsFromISO(value.startsAt, tz))
    const [end, setEnd] = useState<DateComponents>(() => componentsFromISO(value.endsAt, tz))
    const [multiDay, setMultiDay] = useState<boolean>(() => {
        const s = componentsFromISO(value.startsAt, tz)
        const e = componentsFromISO(value.endsAt, tz)
        return !(s.y === e.y && s.m === e.m && s.d === e.d)
    })

    // Re-derive components if the parent swaps in new ISO values (e.g. after
    // a server reload).
    useEffect(() => {
        const s = componentsFromISO(value.startsAt, tz)
        const e = componentsFromISO(value.endsAt, tz)
        setStart(s)
        setEnd(e)
        setMultiDay(!(s.y === e.y && s.m === e.m && s.d === e.d))
    }, [value.startsAt, value.endsAt, tz])

    // Validation: surface a warning when the end timestamp lands before the
    // start. Lets the host catch a typo before saving and shipping a calendar
    // invite with negative duration.
    const endBeforeStart = new Date(value.endsAt) < new Date(value.startsAt)

    // Push changes back up as ISO strings.
    function emit(next: {
        start?: DateComponents
        end?: DateComponents
        allDay?: boolean
        endTimeHidden?: boolean
        endCondition?: string | null
        multiDay?: boolean
    }) {
        const s = next.start ?? start
        let e = next.end ?? end
        const allDay = next.allDay ?? value.allDay
        const hideEnd = next.endTimeHidden ?? value.endTimeHidden
        const cond = next.endCondition !== undefined ? next.endCondition : value.endCondition
        const md = next.multiDay ?? multiDay

        // Keep end's date locked to start's date when not multi-day.
        if (!md) {
            e = { ...e, y: s.y, m: s.m, d: s.d }
        }

        if (next.start !== undefined) setStart(next.start)
        if (next.end !== undefined) setEnd(e)
        if (next.multiDay !== undefined) setMultiDay(md)

        onChange({
            startsAt: componentsToISO(s, tz),
            endsAt: componentsToISO(e, tz),
            allDay,
            endTimeHidden: hideEnd,
            endCondition: cond,
        })
    }

    function setAllDay(checked: boolean) {
        emit({ allDay: checked })
    }

    function setEndTimeHidden(checked: boolean) {
        emit({ endTimeHidden: checked })
    }

    function setEndCondition(text: string) {
        emit({ endCondition: text || null })
    }

    return (
        <div className="stack" style={{ gap: '1.25em' }}>
            <div
                className="row"
                style={{ gap: '1.5em', alignItems: 'center', flexWrap: 'wrap' }}
            >
                <label className="row" style={{ gap: '0.5em', cursor: 'pointer', marginBottom: 0 }}>
                    <input
                        type="checkbox"
                        checked={value.allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                    />
                    <span>All-day event (no times)</span>
                </label>
                {onTimezoneChange && (
                    <TimezoneInline value={timezone} onChange={onTimezoneChange} />
                )}
            </div>

            <div>
                <label style={{ marginBottom: '0.4em' }}>Starts</label>
                <div className="row" style={{ gap: '0.6em', alignItems: 'stretch' }}>
                    <DatePicker value={start} onChange={(c) => emit({ start: c })} />
                    {!value.allDay && <TimePicker value={start} onChange={(c) => emit({ start: c })} />}
                </div>
            </div>

            <div>
                <label style={{ marginBottom: '0.4em' }}>
                    Ends{value.allDay && !multiDay ? ' (same day)' : ''}
                </label>
                <div
                    style={{
                        display: 'inline-flex',
                        gap: '0.6em',
                        alignItems: 'stretch',
                        flexWrap: 'wrap',
                        padding: endBeforeStart ? '3px' : 0,
                        margin: endBeforeStart ? '-3px' : 0,
                        outline: endBeforeStart ? '2px solid var(--danger)' : 'none',
                        outlineOffset: '2px',
                        borderRadius: 'var(--radius)',
                    }}
                >
                    {multiDay && <DatePicker value={end} onChange={(c) => emit({ end: c })} />}
                    {!value.allDay && <TimePicker value={end} onChange={(c) => emit({ end: c })} />}
                </div>
                {endBeforeStart && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.85em', margin: '0.5em 0 0' }}>
                        End is before start. Calendar invites won't make sense.
                    </p>
                )}
                <div
                    className="row"
                    style={{ marginTop: '0.6em', gap: '1.25em', alignItems: 'center', flexWrap: 'wrap' }}
                >
                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => emit({ multiDay: !multiDay })}
                    >
                        {multiDay ? 'Make single-day' : 'Multi-day event'}
                    </button>
                    {!value.allDay && (
                        <label className="row" style={{ gap: '0.5em', cursor: 'pointer', marginBottom: 0 }}>
                            <input
                                type="checkbox"
                                checked={value.endTimeHidden}
                                onChange={(e) => setEndTimeHidden(e.target.checked)}
                            />
                            <span>Don't show end time to attendees</span>
                        </label>
                    )}
                </div>
                {value.endTimeHidden && !value.allDay && (
                    <label style={{ marginTop: '0.75em', display: 'block' }}>
                        End condition (shown to attendees)
                        <input
                            value={value.endCondition ?? ''}
                            onChange={(e) => setEndCondition(e.target.value)}
                            placeholder="Until people leave"
                        />
                    </label>
                )}
            </div>

        </div>
    )
}

