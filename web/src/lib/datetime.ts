// Datetime utilities for the event picker.
//
// We work with "wall-clock components" {y, m, d, h, mi} interpreted in the
// event's IANA timezone, and convert to/from UTC ISO strings at the API
// boundary. This keeps the picker UX consistent regardless of the host's
// browser timezone vs. the event's timezone (e.g. an NYC host editing a
// Chicago event picks "May 22 @ 7pm" - the input means 7pm Chicago).
//
// Note: `m` is 0-indexed to match Date's API.

export type DateComponents = {
    y: number
    m: number // 0-11
    d: number
    h: number // 0-23
    mi: number
}

// componentsFromISO converts a UTC ISO string to {y,m,d,h,mi} components in tz.
export function componentsFromISO(iso: string, tz: string): DateComponents {
    if (!iso) return defaultComponents()
    const d = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
    let hour = parseInt(get('hour'), 10)
    if (hour === 24) hour = 0 // hour12=false sometimes returns "24" for midnight
    return {
        y: parseInt(get('year'), 10),
        m: parseInt(get('month'), 10) - 1,
        d: parseInt(get('day'), 10),
        h: hour,
        mi: parseInt(get('minute'), 10),
    }
}

// componentsToISO interprets components as wall-clock time in tz and returns
// the corresponding UTC ISO string.
export function componentsToISO(c: DateComponents, tz: string): string {
    // Guess UTC by treating components as UTC, then correct by the tz offset
    // at that wall-clock instant.
    const naive = new Date(Date.UTC(c.y, c.m, c.d, c.h, c.mi, 0))
    const offsetMin = tzOffsetMinutes(naive, tz)
    return new Date(naive.getTime() - offsetMin * 60_000).toISOString()
}

// tzOffsetMinutes returns the offset (in minutes east of UTC) that tz had at
// the given instant. e.g. America/Chicago in summer = -300 (CDT).
function tzOffsetMinutes(at: Date, tz: string): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
    })
    const offsetPart = fmt.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetPart)
    if (!m) return 0
    const sign = m[1] === '-' ? -1 : 1
    const hours = parseInt(m[2], 10)
    const mins = m[3] ? parseInt(m[3], 10) : 0
    return sign * (hours * 60 + mins)
}

export function defaultComponents(): DateComponents {
    const now = new Date()
    return {
        y: now.getFullYear(),
        m: now.getMonth(),
        d: now.getDate(),
        h: 12,
        mi: 0,
    }
}

// addMinutesToTime bumps just the hour+minute of components by N minutes,
// wrapping around midnight. The date (y/m/d) is unchanged.
export function bumpTime(c: DateComponents, deltaMinutes: number): DateComponents {
    const total = ((c.h * 60 + c.mi + deltaMinutes) % 1440 + 1440) % 1440
    return { ...c, h: Math.floor(total / 60), mi: total % 60 }
}

// formatTimeOfDay: "12:00 PM", "1:30 PM", "12am" -> we always use the
// full "h:mm AM" form here since this is shown next to dropdown options
// where alignment matters. Use formatTimeShort for compact display.
export function formatTimeFull(c: { h: number; mi: number }): string {
    const period = c.h < 12 ? 'AM' : 'PM'
    const h12 = c.h % 12 === 0 ? 12 : c.h % 12
    return `${h12}:${String(c.mi).padStart(2, '0')} ${period}`
}

export function formatTimeShort(c: { h: number; mi: number }): string {
    const period = c.h < 12 ? 'am' : 'pm'
    const h12 = c.h % 12 === 0 ? 12 : c.h % 12
    return c.mi === 0 ? `${h12}${period}` : `${h12}:${String(c.mi).padStart(2, '0')}${period}`
}

// All 15-minute slots in a day, used to populate the time-picker dropdown.
export function timeSlots(): Array<{ h: number; mi: number; key: string; label: string }> {
    const out: Array<{ h: number; mi: number; key: string; label: string }> = []
    for (let h = 0; h < 24; h++) {
        for (let mi = 0; mi < 60; mi += 15) {
            out.push({ h, mi, key: `${h}:${mi}`, label: formatTimeFull({ h, mi }) })
        }
    }
    return out
}

// Same-day check by wall-clock components.
export function sameDay(a: DateComponents, b: DateComponents): boolean {
    return a.y === b.y && a.m === b.m && a.d === b.d
}
