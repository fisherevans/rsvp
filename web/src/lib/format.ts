// Date formatting helpers that respect the event's configured timezone.

// formatShareWhen builds the text-line used in share sheets and clipboard
// copies. Always absolute (not relative), respects all_day and end_time_hidden.
//
//   "Friday, June 12, 7-11pm CST"
//   "Friday, June 12, 7pm CST"           (end hidden)
//   "Friday, June 12"                    (all-day, single)
//   "Friday, June 12 - Monday, June 15"  (all-day, multi)
export function formatShareWhen(event: {
    starts_at: string
    ends_at: string
    timezone: string
    all_day: boolean
    end_time_hidden: boolean
}): string {
    const tz = event.timezone || 'UTC'
    const start = new Date(event.starts_at)
    const end = new Date(event.ends_at)

    const dayLong = (d: Date) =>
        d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' })

    if (event.all_day) {
        const s = dayLong(start)
        const sParts = tzParts(start, tz)
        const eParts = tzParts(end, tz)
        if (sParts.year === eParts.year && sParts.month === eParts.month && sParts.day === eParts.day) {
            return s
        }
        return `${s} - ${dayLong(end)}`
    }

    const dateLabel = dayLong(start)
    const tzAbbr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short',
    })
        .formatToParts(start)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    const startTime = formatTime(start, tz)

    if (event.end_time_hidden) {
        return tzAbbr ? `${dateLabel}, ${startTime} ${tzAbbr}` : `${dateLabel}, ${startTime}`
    }
    const endTime = formatTime(end, tz)
    return tzAbbr ? `${dateLabel}, ${startTime} - ${endTime} ${tzAbbr}` : `${dateLabel}, ${startTime} - ${endTime}`
}

// formatAbsoluteDate: "Friday, June 12, 2026" (for the absolute date row).
export function formatAbsoluteDate(iso: string, tz: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        timeZone: tz,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    })
}

// formatAbsoluteTimeRange: "7:00 PM - 11:00 PM CST"
//                       or "7:00 PM CST" when end_time_hidden
//                       or "All day" / "Multi-day" for all_day events
export function formatAbsoluteTimeRange(event: {
    starts_at: string
    ends_at: string
    timezone: string
    all_day: boolean
    end_time_hidden: boolean
    end_condition: string | null
}): string {
    const tz = event.timezone || 'UTC'
    if (event.all_day) {
        const sParts = tzParts(new Date(event.starts_at), tz)
        const eParts = tzParts(new Date(event.ends_at), tz)
        const single = sParts.year === eParts.year && sParts.month === eParts.month && sParts.day === eParts.day
        return single ? 'All day' : 'All day (multi-day)'
    }
    const start = new Date(event.starts_at)
    const end = new Date(event.ends_at)
    const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(start)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    const startStr = formatTime(start, tz)
    if (event.end_time_hidden) {
        const cond = event.end_condition ? ` - ${event.end_condition}` : ''
        return tzAbbr ? `${startStr} ${tzAbbr}${cond}` : `${startStr}${cond}`
    }
    const endStr = formatTime(end, tz)
    return tzAbbr ? `${startStr} - ${endStr} ${tzAbbr}` : `${startStr} - ${endStr}`
}

// formatEventWhenDisplay is the high-level display formatter for an event's
// when-line. Handles all-day events, multi-day spans, and hidden end times.
//
// Examples:
//   - timed, single-day:        "This Friday @ 5pm"
//   - timed, multi-day:         "This Friday @ 5pm through Sun Jun 7 @ 2am"
//   - all-day, single-day:      "This Friday"
//   - all-day, multi-day:       "This Friday through Sun Jun 7"
//   - timed, hidden end:        "This Friday @ 5pm, until people leave"
export function formatEventWhenDisplay(event: {
    starts_at: string
    ends_at: string
    timezone: string
    all_day: boolean
    end_time_hidden: boolean
    end_condition: string | null
}, now: Date = new Date()): string {
    const tz = event.timezone || 'UTC'
    const startPhrase = formatRelativeWhen(event.starts_at, tz, now, { omitTime: event.all_day })

    if (event.all_day) {
        const sParts = tzPartsOf(event.starts_at, tz)
        const eParts = tzPartsOf(event.ends_at, tz)
        if (sParts.year === eParts.year && sParts.month === eParts.month && sParts.day === eParts.day) {
            return startPhrase
        }
        // Multi-day all-day: append "through Sun Jun 7"
        const end = new Date(event.ends_at)
        const endLabel = end.toLocaleDateString('en-US', {
            timeZone: tz,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        })
        return `${startPhrase} through ${endLabel}`
    }

    if (event.end_time_hidden) {
        if (event.end_condition) {
            return `${startPhrase}, ${event.end_condition}`
        }
        return startPhrase
    }

    // Timed event. Compare start/end dates in tz to decide whether to show a
    // multi-day suffix.
    const sParts = tzPartsOf(event.starts_at, tz)
    const eParts = tzPartsOf(event.ends_at, tz)
    if (sParts.year === eParts.year && sParts.month === eParts.month && sParts.day === eParts.day) {
        return startPhrase
    }
    const end = new Date(event.ends_at)
    const endLabel = end.toLocaleDateString('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    })
    const endTime = formatTimeOf(event.ends_at, tz)
    return `${startPhrase} through ${endLabel} @ ${endTime}`
}

function tzPartsOf(iso: string, tz: string): { year: number; month: number; day: number } {
    return tzParts(new Date(iso), tz)
}

function formatTimeOf(iso: string, tz: string): string {
    return formatTime(new Date(iso), tz)
}

// formatRelativeWhen produces a natural-language description of when an event
// happens, biased toward how a host would describe it in conversation.
//
// Bands (computed against the event's configured timezone):
//   - today / tomorrow                 -> "Today @ 5pm" / "Tomorrow @ 5pm"
//   - same calendar week               -> "This Friday @ 5pm"
//   - next calendar week               -> "Next Wednesday @ 4pm"
//   - 2-4 weekday-counts out           -> "3 Saturdays from now @ 2pm"
//   - next calendar month              -> "Next month, Saturday, June 4th @ 2:30pm"
//   - 2-3 calendar months out          -> "2 months from now, ..."
//   - same year, > 3 months out        -> "N months from now, ..."
//   - next calendar year, > 3 months   -> "Next year, Friday, January 12th @ 3pm"
//   - past or far future fallback      -> "Saturday, June 4th 2027 @ 2:30pm"
//
// Pass omitTime to drop the "@ Xpm" suffix (for all-day events).
//
// Always uses the event's tz so what the host sees matches what guests see.
export function formatRelativeWhen(startsAt: string, timezone: string, now: Date = new Date(), opts: { omitTime?: boolean } = {}): string {
    const tz = timezone || 'UTC'
    const startDate = new Date(startsAt)
    const timeRaw = formatTime(startDate, tz)
    const time = opts.omitTime ? '' : timeRaw
    const at = opts.omitTime ? '' : ` @ ${timeRaw}`
    const weekday = startDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' })

    const sParts = tzParts(startDate, tz)
    const nParts = tzParts(now, tz)

    const eventDay = Date.UTC(sParts.year, sParts.month, sParts.day)
    const nowDay = Date.UTC(nParts.year, nParts.month, nParts.day)
    const dayDiff = Math.round((eventDay - nowDay) / 86400000)

    if (dayDiff < 0) {
        // Past event: just show the absolute date.
        return `${weekday}, ${monthName(sParts.month)} ${ord(sParts.day)} ${sParts.year}${at}`
    }
    if (dayDiff === 0) return `Today${at}`
    if (dayDiff === 1) return `Tomorrow${at}`

    // Week math: Sunday-start weeks in the event tz.
    const eventDow = dowFromDate(sParts)
    const nowDow = dowFromDate(nParts)
    const eventWeekStart = eventDay - eventDow * 86400000
    const nowWeekStart = nowDay - nowDow * 86400000
    const weekDiff = Math.round((eventWeekStart - nowWeekStart) / (7 * 86400000))

    if (weekDiff === 0) return `This ${weekday}${at}`
    if (weekDiff === 1) return `Next ${weekday}${at}`
    if (weekDiff >= 2 && weekDiff <= 4) return `${weekDiff} ${weekday}s from now${at}`

    // Month math.
    const monthDiff = (sParts.year - nParts.year) * 12 + (sParts.month - nParts.month)
    const dateSuffix = `${weekday}, ${monthName(sParts.month)} ${ord(sParts.day)}${at}`

    if (monthDiff === 1) return `Next month, ${dateSuffix}`
    if (monthDiff >= 2 && monthDiff <= 3) return `${monthDiff} months from now, ${dateSuffix}`
    if (sParts.year === nParts.year + 1 && monthDiff > 3) return `Next year, ${dateSuffix}`
    if (monthDiff > 3) return `${monthDiff} months from now, ${dateSuffix}`

    // Fallback - should rarely hit given the bands above cover everything from 0 onward.
    void time
    return `${weekday}, ${monthName(sParts.month)} ${ord(sParts.day)} ${sParts.year}${at}`
}

// formatTime: "5pm", "2:30pm", "12am". Minutes omitted when zero.
function formatTime(d: Date, tz: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).formatToParts(d)
    let hour = '12'
    let minute = '00'
    let dayPeriod = 'am'
    for (const p of parts) {
        if (p.type === 'hour') hour = p.value.replace(/^0/, '')
        else if (p.type === 'minute') minute = p.value
        else if (p.type === 'dayPeriod') dayPeriod = p.value.toLowerCase().replace(/\s/g, '')
    }
    return minute === '00' ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
}

// tzParts extracts the local Y/M/D in a specific timezone without going through
// a Date constructor (which would re-interpret in the runtime's local zone).
function tzParts(d: Date, tz: string): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
    return {
        year: parseInt(get('year'), 10),
        month: parseInt(get('month'), 10) - 1, // 0-indexed to match Date semantics
        day: parseInt(get('day'), 10),
    }
}

// dowFromDate returns 0-6 (Sun-Sat) for the given Y/M/D, using UTC math so
// it doesn't depend on the runtime's local zone.
function dowFromDate(p: { year: number; month: number; day: number }): number {
    return new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay()
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
function monthName(m: number): string {
    return MONTH_NAMES[m] ?? '?'
}

// ord: 1 -> "1st", 2 -> "2nd", ..., 21 -> "21st", 22 -> "22nd", ..., 11 -> "11th"
function ord(n: number): string {
    const mod100 = n % 100
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`
    switch (n % 10) {
        case 1: return `${n}st`
        case 2: return `${n}nd`
        case 3: return `${n}rd`
        default: return `${n}th`
    }
}

export function formatEventWhen(startsAt: string, endsAt: string, timezone: string): string {
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    const tz = timezone || undefined
    const sameDay = start.toLocaleDateString('en-US', { timeZone: tz }) === end.toLocaleDateString('en-US', { timeZone: tz })

    const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: tz }
    const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }

    if (sameDay) {
        const dateStr = start.toLocaleDateString('en-US', dateFmt)
        const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
        const endTime = end.toLocaleTimeString('en-US', timeFmt)
        return `${dateStr}, ${startTime} - ${endTime}`
    }
    return `${start.toLocaleString('en-US', { ...dateFmt, ...timeFmt })} - ${end.toLocaleString('en-US', { ...dateFmt, ...timeFmt })}`
}

// toLocalInput converts a UTC ISO string to the format an <input type="datetime-local"> expects.
// Uses the event's timezone so what the manager sees matches what guests see.
export function toLocalInput(iso: string, timezone: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    const tz = timezone || undefined
    // Build YYYY-MM-DDTHH:MM from individual parts so we get the right TZ wall-clock.
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }
    const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d)
    const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

// fromLocalInput converts a <input type="datetime-local"> string (interpreted in
// the given timezone) to a UTC ISO string suitable for the API.
export function fromLocalInput(local: string, timezone: string): string {
    if (!local) return ''
    // Treat 'YYYY-MM-DDTHH:MM' as wall-clock in `timezone`. Compute the UTC instant
    // by guessing UTC for the wall clock then correcting by the tz offset at that instant.
    const guessUTC = new Date(local + 'Z')
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'shortOffset',
    })
    const parts = fmt.formatToParts(guessUTC)
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetPart)
    if (!m) return guessUTC.toISOString()
    const sign = m[1] === '-' ? -1 : 1
    const hours = parseInt(m[2], 10)
    const mins = m[3] ? parseInt(m[3], 10) : 0
    const offsetMs = sign * (hours * 60 + mins) * 60_000
    return new Date(guessUTC.getTime() - offsetMs).toISOString()
}
