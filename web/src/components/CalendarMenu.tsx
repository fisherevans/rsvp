import { useState } from 'react'
import { CalendarPlus, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react'
import type { EventDetails } from '../lib/types'
import { Modal } from './Modal'

// CalendarMenu renders an "Add to calendar" button that opens a modal listing
// the available targets: Google Calendar (deep link), Outlook (deep link),
// and a .ics download (Apple Calendar + everything else).
//
// Google's deep link prefills the event creation form. Same with Outlook.
// The .ics fallback covers Apple Calendar, Thunderbird, and offline use.
export function CalendarMenu({ event, code, baseURL }: { event: EventDetails; code: string; baseURL?: string }) {
    const [open, setOpen] = useState(false)

    const origin = baseURL ?? window.location.origin
    const pageURL = `${origin}/event/${event.slug}?code=${encodeURIComponent(code)}`
    const description = `RSVP: ${pageURL}${event.summary ? '\n\n' + event.summary : ''}`

    const location = formatLocation(event.address_label, event.address)
    const googleURL = buildGoogleURL(event.name, event.starts_at, event.ends_at, description, location, event.all_day, event.timezone)
    const outlookURL = buildOutlookURL(event.name, event.starts_at, event.ends_at, description, location, event.all_day)
    const icsURL = `/api/event/${event.slug}/calendar.ics?code=${encodeURIComponent(code)}`

    return (
        <>
            <button type="button" className="secondary" onClick={() => setOpen(true)}>
                <CalendarPlus size={18} weight="bold" />
                Add to calendar
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title="Add to calendar">
                <div className="stack" style={{ gap: '0.6em' }}>
                    <CalOption
                        href={googleURL}
                        target="_blank"
                        onActivate={() => setOpen(false)}
                        label="Google Calendar"
                        sub="Opens calendar.google.com with the event prefilled"
                        external
                    />
                    <CalOption
                        href={outlookURL}
                        target="_blank"
                        onActivate={() => setOpen(false)}
                        label="Outlook.com"
                        sub="Opens outlook.live.com with the event prefilled"
                        external
                    />
                    <CalOption
                        href={icsURL}
                        onActivate={() => setOpen(false)}
                        label="Apple Calendar / .ics download"
                        sub="Saves the event file - works with any calendar app"
                    />
                </div>
            </Modal>
        </>
    )
}

function CalOption({
    href,
    target,
    onActivate,
    label,
    sub,
    external,
}: {
    href: string
    target?: string
    onActivate: () => void
    label: string
    sub: string
    external?: boolean
}) {
    return (
        <a
            href={href}
            target={target}
            rel={target ? 'noopener noreferrer' : undefined}
            onClick={onActivate}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85em',
                background: 'var(--surface)',
                border: '2px solid var(--ink)',
                borderRadius: 'var(--radius)',
                padding: '0.85em 1em',
                textDecoration: 'none',
                color: 'var(--text)',
                boxShadow: 'var(--shadow-sm)',
                transition: 'transform 0.06s ease-out, box-shadow 0.06s ease-out',
            }}
            onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translate(2px, 2px)'
                e.currentTarget.style.boxShadow = '2px 2px 0 0 var(--ink)'
            }}
            onMouseUp={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
            }}
        >
            <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div className="muted" style={{ fontSize: '0.85em', marginTop: '0.15em' }}>
                    {sub}
                </div>
            </span>
            {external ? (
                <ArrowSquareOut size={20} weight="bold" />
            ) : (
                <DownloadSimple size={20} weight="bold" />
            )}
        </a>
    )
}

// Google Calendar template URL:
//   https://calendar.google.com/calendar/render?action=TEMPLATE&text=Title&dates=START/END&details=Desc
// Dates are basic ISO (YYYYMMDDTHHMMSSZ) in UTC.
function buildGoogleURL(
    name: string,
    startsAt: string,
    endsAt: string,
    description: string,
    location: string,
    allDay: boolean,
    timezone: string,
): string {
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: name,
        details: description,
    })
    if (allDay) {
        const start = toGoogleAllDay(startsAt, timezone)
        const end = toGoogleAllDay(addOneDay(endsAt), timezone)
        params.set('dates', `${start}/${end}`)
    } else {
        params.set('dates', `${toGoogleDate(startsAt)}/${toGoogleDate(endsAt)}`)
    }
    if (location) params.set('location', location)
    return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Outlook.com web compose URL. Has an "allday" flag.
function buildOutlookURL(name: string, startsAt: string, endsAt: string, description: string, location: string, allDay: boolean): string {
    const params = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        subject: name,
        startdt: startsAt,
        enddt: endsAt,
        body: description,
    })
    if (allDay) params.set('allday', 'true')
    if (location) params.set('location', location)
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

function toGoogleAllDay(iso: string, tz: string): string {
    const d = new Date(iso)
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    return `${get('year')}${get('month')}${get('day')}`
}

function addOneDay(iso: string): string {
    const d = new Date(iso)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString()
}

function toGoogleDate(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        'Z'
    )
}

function formatLocation(label: string | null, address: string | null): string {
    const l = label?.trim() ?? ''
    const a = address?.trim() ?? ''
    if (l && a) return `${l} - ${a}`
    return l || a
}
