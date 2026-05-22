// DatePicker + TimePicker primitives used by EventDateTimeFields.
//
// DatePicker: button that opens a react-day-picker calendar popover.
// TimePicker: two surfaces.
//   - Touch device (pointer: coarse) -> <input type="time">, which on iOS
//     opens the wheel picker and on Android opens the clock dial. The OS
//     pickers are better than anything we can build inline for one-handed
//     phone use, so we just hand off.
//   - Desktop -> stepper + editable hour/minute inputs + AM/PM toggle.
//     Click any number to type, use carets or arrow keys to step.
//
// Both work on DateComponents (wall-clock, no tz) - the calling form is
// responsible for tz <-> ISO conversion via lib/datetime.

import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CaretUp, CaretDown } from '@phosphor-icons/react'
import type { DateComponents } from '../lib/datetime'
import { useTouchDevice } from '../lib/touch'

export function DatePicker({
    value,
    onChange,
}: {
    value: DateComponents
    onChange: (next: DateComponents) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onClick(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    // react-day-picker works with native Dates. We use Date(y, m, d) which
    // represents that wall-clock date at midnight in the browser's local
    // zone - we only read the y/m/d fields, never the absolute timestamp.
    const date = new Date(value.y, value.m, value.d)
    const label = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })

    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="btn-bare"
                onClick={() => setOpen(!open)}
                style={{
                    background: 'var(--surface)',
                    border: '2px solid var(--ink)',
                    borderRadius: 'var(--radius)',
                    padding: '0 1em',
                    minWidth: 180,
                    height: '4.4em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: '1em',
                    cursor: 'pointer',
                    textTransform: 'none',
                    letterSpacing: 0,
                }}
            >
                {label}
            </button>
            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 0.25em)',
                        left: 0,
                        zIndex: 30,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        boxShadow: 'var(--shadow-md)',
                        padding: '0.5em',
                    }}
                >
                    <DayPicker
                        mode="single"
                        selected={date}
                        defaultMonth={date}
                        onSelect={(d) => {
                            if (!d) return
                            onChange({ ...value, y: d.getFullYear(), m: d.getMonth(), d: d.getDate() })
                            setOpen(false)
                        }}
                    />
                </div>
            )}
        </div>
    )
}

export function TimePicker({
    value,
    onChange,
}: {
    value: DateComponents
    onChange: (next: DateComponents) => void
}) {
    const touch = useTouchDevice()
    if (touch) return <NativeTimePicker value={value} onChange={onChange} />
    return <DesktopTimePicker value={value} onChange={onChange} />
}

// NativeTimePicker: a styled <input type="time"> so iOS/Android hand off to
// their native wheel / clock pickers. Sized to match the DatePicker button
// so the two read as a matched pair.
function NativeTimePicker({
    value,
    onChange,
}: {
    value: DateComponents
    onChange: (next: DateComponents) => void
}) {
    const hhmm = `${String(value.h).padStart(2, '0')}:${String(value.mi).padStart(2, '0')}`

    return (
        <input
            type="time"
            value={hhmm}
            onChange={(e) => {
                const v = e.target.value
                if (!v) return
                const [h, mi] = v.split(':').map((x) => parseInt(x, 10))
                if (!isNaN(h) && !isNaN(mi)) onChange({ ...value, h, mi })
            }}
            style={{
                height: '4.4em',
                fontSize: '1.25em',
                fontWeight: 700,
                textAlign: 'center',
                padding: '0 0.75em',
                width: 'auto',
                minWidth: '9em',
            }}
            aria-label="Time"
        />
    )
}

// DesktopTimePicker: hour + minute stepper inputs (editable, typeable) plus
// an AM/PM toggle. Up/down carets step by 1 hour / 15 minutes; manual entry
// accepts 1-12 / 0-59.
function DesktopTimePicker({
    value,
    onChange,
}: {
    value: DateComponents
    onChange: (next: DateComponents) => void
}) {
    const period = value.h < 12 ? 'AM' : 'PM'
    const h12 = value.h % 12 === 0 ? 12 : value.h % 12

    function setHour12(n: number) {
        const isPM = value.h >= 12
        onChange({ ...value, h: (n % 12) + (isPM ? 12 : 0) })
    }
    function bumpHour(delta: number) {
        const next = (((value.h + delta) % 24) + 24) % 24
        onChange({ ...value, h: next })
    }
    function setMinute(mi: number) {
        onChange({ ...value, mi: ((mi % 60) + 60) % 60 })
    }
    function bumpMinute(delta: number) {
        const next = (((value.mi + delta) % 60) + 60) % 60
        onChange({ ...value, mi: next })
    }
    function togglePeriod() {
        onChange({ ...value, h: (value.h + 12) % 24 })
    }

    return (
        <div
            style={{
                display: 'inline-flex',
                gap: '0.4em',
                alignItems: 'center',
                background: 'var(--surface)',
                border: '2px solid var(--ink)',
                borderRadius: 'var(--radius)',
                padding: '0 0.55em',
                height: '4.4em',
            }}
        >
            <Stepper
                value={h12}
                pad={0}
                onUp={() => bumpHour(1)}
                onDown={() => bumpHour(-1)}
                onCommit={(n) => setHour12(clamp(n, 1, 12))}
                ariaLabel="Hour"
            />
            <span style={{ fontSize: '1.5em', fontWeight: 700, lineHeight: 1 }}>:</span>
            <Stepper
                value={value.mi}
                pad={2}
                onUp={() => bumpMinute(15)}
                onDown={() => bumpMinute(-15)}
                onCommit={(n) => setMinute(clamp(n, 0, 59))}
                ariaLabel="Minute"
            />
            <button
                type="button"
                onClick={togglePeriod}
                aria-label="Toggle AM/PM"
                className="btn-quiet"
                style={{
                    fontSize: '0.9em',
                    fontWeight: 700,
                    minWidth: '2.6em',
                    border: '1px solid var(--border-soft)',
                    color: 'var(--text)',
                }}
            >
                {period}
            </button>
        </div>
    )
}

function Stepper({
    value,
    pad,
    onUp,
    onDown,
    onCommit,
    ariaLabel,
}: {
    value: number
    pad: number
    onUp: () => void
    onDown: () => void
    onCommit: (n: number) => void
    ariaLabel: string
}) {
    const [draft, setDraft] = useState<string>(() =>
        pad ? String(value).padStart(pad, '0') : String(value),
    )
    const lastValue = useRef(value)

    if (lastValue.current !== value) {
        lastValue.current = value
        const next = pad ? String(value).padStart(pad, '0') : String(value)
        if (draft !== next) setDraft(next)
    }

    function commit() {
        const n = parseInt(draft, 10)
        if (isNaN(n)) {
            setDraft(pad ? String(value).padStart(pad, '0') : String(value))
            return
        }
        onCommit(n)
    }

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
                type="button"
                onClick={onUp}
                aria-label={`${ariaLabel} up`}
                className="btn-quiet"
                style={{ fontSize: '0.7em' }}
            >
                <CaretUp size={14} weight="bold" />
            </button>
            <input
                className="time-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={commit}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        commit()
                        ;(e.target as HTMLInputElement).blur()
                    } else if (e.key === 'Escape') {
                        setDraft(pad ? String(value).padStart(pad, '0') : String(value))
                        ;(e.target as HTMLInputElement).blur()
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        onUp()
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        onDown()
                    }
                }}
                aria-label={ariaLabel}
            />
            <button
                type="button"
                onClick={onDown}
                aria-label={`${ariaLabel} down`}
                className="btn-quiet"
                style={{ fontSize: '0.7em' }}
            >
                <CaretDown size={14} weight="bold" />
            </button>
        </div>
    )
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n))
}
