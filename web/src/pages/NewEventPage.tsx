import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { stashRedirect } from '../lib/authRedirect'
import type { Event } from '../lib/types'
import { defaultTimezone } from '../components/TimezoneSelect'
import { EventDateTimeFields } from '../components/EventDateTimeFields'
import type { DateTimeValue } from '../components/EventDateTimeFields'
import { useDocumentTitle } from '../lib/title'

// NewEventPage: dedicated form for creating an event. Lives at /manage/new
// so the form has room to breathe rather than being squeezed inline on the
// event list.
//
// Requires manager session; redirects to /manage (which shows the login form)
// if the session check fails.
export default function NewEventPage() {
    useDocumentTitle('New Event · RSVP')
    const nav = useNavigate()
    const [authChecked, setAuthChecked] = useState(false)
    const [name, setName] = useState('')
    const [tz, setTz] = useState(defaultTimezone())
    const [dt, setDt] = useState<DateTimeValue>(() => defaultDateTime())
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        api('/api/manage/me')
            .then(() => setAuthChecked(true))
            .catch((e) => {
                if (e instanceof ApiError && e.status === 401) {
                    stashRedirect('/manage/new')
                    nav('/manage', { replace: true })
                } else {
                    setErr(e instanceof Error ? e.message : String(e))
                }
            })
    }, [nav])

    async function submit(e: FormEvent) {
        e.preventDefault()
        setErr(null)
        setBusy(true)
        try {
            const ev = await api<Event>('/api/manage/events', {
                body: {
                    name,
                    starts_at: dt.startsAt,
                    ends_at: dt.endsAt,
                    all_day: dt.allDay,
                    end_time_hidden: dt.endTimeHidden,
                    end_condition: dt.endCondition,
                    timezone: tz,
                },
            })
            nav(`/manage/event/${ev.slug}`)
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'failed')
            setBusy(false)
        }
    }

    if (!authChecked && !err) return <div className="container">Loading...</div>

    return (
        <div className="container" style={{ maxWidth: 680 }}>
            <p>
                <Link to="/manage">&larr; All events</Link>
            </p>
            <h1>New Event</h1>
            <p className="muted" style={{ marginBottom: '2em' }}>
                Fill in the basics. You can edit details, theme, attendees, and more after creating.
            </p>

            <form onSubmit={submit} className="stack" style={{ gap: '1.5em' }}>
                <label>
                    Name
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        placeholder="Fisher's Birthday Bash"
                    />
                </label>

                <EventDateTimeFields
                    value={dt}
                    timezone={tz}
                    onChange={setDt}
                    onTimezoneChange={setTz}
                />

                {err && (
                    <p style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>
                )}

                <div className="row" style={{ gap: '0.75em', marginTop: '0.5em' }}>
                    <button type="submit" disabled={busy || !name.trim()}>
                        {busy ? 'Creating...' : 'Create event'}
                    </button>
                    <Link to="/manage">
                        <button type="button" className="secondary">
                            Cancel
                        </button>
                    </Link>
                </div>
            </form>
        </div>
    )
}

// defaultDateTime: today at noon -> today at 2pm. TZ-aware adjustment happens
// inside EventDateTimeFields once it sees the chosen tz.
function defaultDateTime(): DateTimeValue {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0)
    return {
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: false,
        endTimeHidden: false,
        endCondition: null,
    }
}
