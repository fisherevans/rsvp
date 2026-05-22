import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import type { EventDetails, RSVPResponse, ResponseStatus, Attendee } from '../lib/types'
import { Calendar, Clock, MapPin, Share } from '@phosphor-icons/react'
import { formatEventWhenDisplay, formatAbsoluteDate, formatAbsoluteTimeRange } from '../lib/format'
import { useDocumentTitle } from '../lib/title'
import { SegmentedControl } from '../components/SegmentedControl'
import { ShareBox } from '../components/ShareBox'
import { CalendarMenu } from '../components/CalendarMenu'
import { Modal } from '../components/Modal'
import { loadFont } from '../lib/fonts'

const codeStorageKey = (slug: string) => `rsvp:code:${slug}`
// Per-event: the response id you submitted last (so we can show "your RSVP" + edit).
const myResponseKey = (slug: string) => `rsvp:my-response:${slug}`
// Global: the most recent attendee ids you RSVPed for, regardless of event.
// Used to pre-select attendees on subsequent RSVPs in the same household.
const lastAttendeesKey = 'rsvp:last-attendees-by-slug'

type LastAttendees = Record<string, string[]>

function readLastAttendees(slug: string): string[] {
    try {
        const raw = localStorage.getItem(lastAttendeesKey)
        if (!raw) return []
        const m = JSON.parse(raw) as LastAttendees
        return m[slug] ?? []
    } catch {
        return []
    }
}

function writeLastAttendees(slug: string, ids: string[]): void {
    try {
        const raw = localStorage.getItem(lastAttendeesKey)
        const m = (raw ? (JSON.parse(raw) as LastAttendees) : {}) as LastAttendees
        m[slug] = ids
        localStorage.setItem(lastAttendeesKey, JSON.stringify(m))
    } catch {
        // ignore
    }
}

export default function EventPage() {
    const { slug = '' } = useParams()
    const [params, setParams] = useSearchParams()
    const [code, setCode] = useState<string | null>(() => {
        const fromUrl = params.get('code')
        if (fromUrl) return fromUrl
        return localStorage.getItem(codeStorageKey(slug))
    })
    const [data, setData] = useState<EventDetails | null>(null)
    const [needsCode, setNeedsCode] = useState(false)
    const [eventName, setEventName] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!code) {
            setNeedsCode(true)
            return
        }
        try {
            const d = await api<EventDetails>(`/api/event/${slug}/`, { code })
            setData(d)
            setNeedsCode(false)
            setEventName(d.name)
            localStorage.setItem(codeStorageKey(slug), code)
            if (params.get('code')) {
                const next = new URLSearchParams(params)
                next.delete('code')
                setParams(next, { replace: true })
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
                setNeedsCode(true)
                localStorage.removeItem(codeStorageKey(slug))
            } else if (e instanceof ApiError && e.status === 410) {
                const body = e.body as { canonical_slug?: string }
                if (body?.canonical_slug) {
                    window.location.replace(
                        `/event/${body.canonical_slug}${params.get('code') ? `?code=${params.get('code')}` : ''}`,
                    )
                    return
                }
                setErr(e.message)
            } else {
                setErr(e instanceof Error ? e.message : String(e))
            }
        }
    }, [slug, code, params, setParams])

    useEffect(() => {
        reload()
    }, [reload])

    // Apply theming once data is loaded. title_font goes to headings, text_font
    // to body, and the *_scale multipliers tune relative sizes via CSS vars.
    useEffect(() => {
        if (!data) return
        const root = document.documentElement
        if (data.theme_accent) root.style.setProperty('--accent', data.theme_accent)
        if (data.text_font) {
            loadFont(data.text_font)
            document.body.style.fontFamily = `"${data.text_font}", system-ui, sans-serif`
        }
        if (data.title_font) {
            loadFont(data.title_font)
            root.style.setProperty('--title-font', `"${data.title_font}", system-ui, sans-serif`)
        }
        root.style.setProperty('--title-scale', String(data.title_scale || 1))
        root.style.setProperty('--text-scale', String(data.text_scale || 1))
    }, [data])

    useDocumentTitle(data?.name ?? eventName ?? 'RSVP')

    if (err) return <div className="container">Error: {err}</div>
    if (needsCode) return <CodeGate slug={slug} initialName={eventName} onCode={(c) => setCode(c)} />
    if (!data) return <div className="container">Loading...</div>

    return <EventBody data={data} reload={reload} />
}

function EventBody({ data, reload }: { data: EventDetails; reload: () => void }) {
    const [shareOpen, setShareOpen] = useState(false)
    const dateText = formatDateRowText(data)
    const timeText = formatAbsoluteTimeRange(data)

    return (
        <div className="event-themed">
            {/* Per-event font scales + family + case. CSS vars set in the effect above. */}
            <style>{`
                .event-themed h1 { font-size: calc(2rem * var(--title-scale, 1)); }
                .event-themed h2 { font-size: calc(1.35rem * var(--title-scale, 1)); }
                .event-themed h3 { font-size: calc(1.1rem * var(--title-scale, 1)); }
                .event-themed { font-size: calc(1rem * var(--text-scale, 1)); }
                .event-themed h1, .event-themed h2, .event-themed h3, .event-themed h4 {
                    text-transform: ${titleCaseToCss(data.title_case)} !important;
                }
                ${data.title_font ? '.event-themed h1, .event-themed h2, .event-themed h3 { font-family: var(--title-font) !important; }' : ''}
            `}</style>
            {data.theme_header_image && (
                <img
                    src={data.theme_header_image}
                    alt=""
                    style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }}
                />
            )}
            <div className="container">
                <h1>{data.name}</h1>

                <div
                    style={{
                        fontSize: '1.35em',
                        fontWeight: 500,
                        marginBottom: '0.75em',
                        lineHeight: 1.3,
                    }}
                >
                    {formatEventWhenDisplay(data)}
                </div>

                <div className="stack" style={{ gap: '0.3em', marginBottom: '1.25em' }}>
                    <InfoRow icon={<Calendar size={18} weight="bold" />} text={dateText} />
                    <InfoRow icon={<Clock size={18} weight="bold" />} text={timeText} />
                    {(data.address || data.address_label) && (
                        <InfoRow
                            icon={<MapPin size={18} weight="bold" />}
                            alignTop={!!(data.address_label && data.address)}
                            text={
                                <>
                                    {data.address_label && (
                                        <div>
                                            <strong style={{ color: 'var(--text)' }}>
                                                {data.address_label}
                                            </strong>
                                        </div>
                                    )}
                                    {data.address && (
                                        <div>
                                            <a
                                                href={`https://maps.google.com/?q=${encodeURIComponent(data.address)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {data.address}
                                            </a>
                                        </div>
                                    )}
                                </>
                            }
                        />
                    )}
                </div>

                <div className="row" style={{ marginBottom: '1.5em' }}>
                    <CalendarMenu event={data} code={data.code} />
                    <button type="button" className="secondary" onClick={() => setShareOpen(true)}>
                        <Share size={18} weight="bold" />
                        Share event
                    </button>
                </div>

                <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share event">
                    <ShareBox event={data} code={data.code} />
                </Modal>

                {data.locked_effective && (
                    <p className="card" style={{ borderColor: 'var(--danger)' }}>
                        This event is locked. You can view but not modify RSVPs.
                    </p>
                )}

                {data.details_html && (
                    <section className="card" style={{ marginTop: '1.5em' }}>
                        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: data.details_html }} />
                    </section>
                )}

                <RSVPSection data={data} code={data.code} onChanged={reload} />
                <ResponseRoster data={data} />
            </div>
        </div>
    )
}

function InfoRow({
    icon,
    text,
    alignTop,
}: {
    icon: React.ReactNode
    text: React.ReactNode
    alignTop?: boolean
}) {
    return (
        <div
            className="muted"
            style={{
                display: 'flex',
                alignItems: alignTop ? 'flex-start' : 'center',
                gap: '0.5em',
                fontSize: '0.95em',
                lineHeight: 1.4,
            }}
        >
            <span
                style={{
                    flex: '0 0 auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    paddingTop: alignTop ? '0.2em' : 0,
                }}
            >
                {icon}
            </span>
            <span>{text}</span>
        </div>
    )
}

function titleCaseToCss(c: 'normal' | 'upper' | 'lower' | undefined): string {
    if (c === 'upper') return 'uppercase'
    if (c === 'lower') return 'lowercase'
    return 'none'
}

function formatDateRowText(event: EventDetails): string {
    const tz = event.timezone || 'UTC'
    const startDate = formatAbsoluteDate(event.starts_at, tz)
    // Multi-day check by date in tz.
    const sParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(event.starts_at))
    const eParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(event.ends_at))
    const sKey = sParts.map((p) => p.value).join('')
    const eKey = eParts.map((p) => p.value).join('')
    if (sKey === eKey) return startDate
    return `${startDate} - ${formatAbsoluteDate(event.ends_at, tz)}`
}

type GatePreview = { name: string; theme_header_image: string | null }

function CodeGate({
    slug,
    initialName,
    onCode,
}: {
    slug: string
    initialName: string | null
    onCode: (code: string) => void
}) {
    const [code, setCode] = useState('')
    const [preview, setPreview] = useState<GatePreview | null>(
        initialName ? { name: initialName, theme_header_image: null } : null,
    )

    // Fetch the public preview (name + minimal theme) on mount so the gate
    // can show the event name without requiring the code first.
    useEffect(() => {
        let cancelled = false
        fetch(`/api/event/${slug}/preview`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: GatePreview | null) => {
                if (!cancelled && d) setPreview(d)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [slug])

    return (
        <div
            className="container"
            style={{
                maxWidth: 480,
                textAlign: 'center',
                paddingTop: '4em',
            }}
        >
            <h1 style={{ marginBottom: '0.5em' }}>{preview?.name ?? '...'}</h1>
            <p className="muted" style={{ marginBottom: '2em' }}>
                Enter the access code from your invite to view this event.
            </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    if (code.trim()) onCode(code.trim())
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1em' }}
            >
                <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoFocus
                    placeholder="Access code"
                    style={{ maxWidth: 280, textAlign: 'center', letterSpacing: '0.1em', fontWeight: 600 }}
                />
                <button type="submit" disabled={!code.trim()}>
                    View event
                </button>
            </form>
        </div>
    )
}

// ----- RSVP section: standalone button -> modal form / "noted" confirmation on page -----

function RSVPSection({ data, code, onChanged }: { data: EventDetails; code: string; onChanged: () => void }) {
    // Look up the response the user submitted last (if it still exists).
    const myResponseId = localStorage.getItem(myResponseKey(data.slug))
    const myResponse = useMemo(
        () => (myResponseId ? data.responses.find((r) => r.id === myResponseId) : undefined),
        [data.responses, myResponseId],
    )

    // Modal can be: closed, blank form, or editing an existing response.
    const [modalState, setModalState] = useState<
        { kind: 'closed' } | { kind: 'open'; editing?: RSVPResponse }
    >({ kind: 'closed' })

    // If the saved response was deleted, drop the local pointer.
    useEffect(() => {
        if (myResponseId && !data.responses.some((r) => r.id === myResponseId)) {
            localStorage.removeItem(myResponseKey(data.slug))
        }
    }, [data.responses, data.slug, myResponseId])

    if (data.locked_effective) return null

    return (
        <div style={{ marginTop: '2em', marginBottom: '1.5em' }}>
            {myResponse ? (
                <NotedConfirmation
                    data={data}
                    response={myResponse}
                    onEdit={() => setModalState({ kind: 'open', editing: myResponse })}
                    onStartFresh={() => setModalState({ kind: 'open' })}
                />
            ) : (
                <button
                    onClick={() => setModalState({ kind: 'open' })}
                    style={{
                        width: '100%',
                        fontSize: '1.15em',
                        fontWeight: 600,
                        padding: '0.9em 1.5em',
                    }}
                >
                    RSVP
                </button>
            )}

            <Modal
                open={modalState.kind === 'open'}
                onClose={() => setModalState({ kind: 'closed' })}
                title={modalState.kind === 'open' && modalState.editing ? 'Edit RSVP' : 'RSVP'}
            >
                {modalState.kind === 'open' && (
                    <RSVPForm
                        data={data}
                        code={code}
                        editing={modalState.editing}
                        onSubmitted={(response) => {
                            localStorage.setItem(myResponseKey(data.slug), response.id)
                            writeLastAttendees(data.slug, response.attendee_ids)
                            setModalState({ kind: 'closed' })
                            onChanged()
                        }}
                        onCancel={() => setModalState({ kind: 'closed' })}
                    />
                )}
            </Modal>
        </div>
    )
}

function NotedConfirmation({
    data,
    response,
    onEdit,
    onStartFresh,
}: {
    data: EventDetails
    response: RSVPResponse
    onEdit: () => void
    onStartFresh: () => void
}) {
    const names = response.attendee_ids
        .map((id) => data.attendees.find((a) => a.id === id)?.name ?? id)
        .join(', ')
    const statusText: Record<ResponseStatus, string> = {
        attending: 'attending',
        maybe: 'maybe',
        not_attending: 'not attending',
        invited: 'invited',
    }
    const guestSuffix =
        response.additional_guests > 0
            ? ` (+${response.additional_guests} additional guest${response.additional_guests === 1 ? '' : 's'})`
            : ''

    return (
        <div className="stack">
            <div
                style={{
                    background: 'var(--surface-alt)',
                    padding: '1em',
                    borderRadius: 'var(--radius)',
                    borderLeft: '3px solid #2e8b57',
                }}
            >
                <strong style={{ fontSize: '1.05em' }}>RSVP noted!</strong>
                <p style={{ margin: '0.5em 0 0' }}>
                    <strong>{names}</strong>
                    {guestSuffix} - {statusText[response.status]}
                </p>
                {response.status_note && (
                    <p className="muted" style={{ margin: '0.25em 0 0', fontStyle: 'italic' }}>
                        "{response.status_note}"
                    </p>
                )}
            </div>
            <div className="row">
                <button onClick={onEdit}>Edit your RSVP</button>
                <button onClick={onStartFresh} className="secondary">
                    RSVP for someone else
                </button>
            </div>
        </div>
    )
}

// ----- RSVP form -----

const STATUS_OPTIONS: Array<{ value: ResponseStatus; label: string; color?: string }> = [
    { value: 'attending', label: 'Attending', color: '#2e8b57' },
    { value: 'maybe', label: 'Maybe', color: '#c98e1d' },
    { value: 'not_attending', label: 'Not attending', color: '#a02d22' },
]

function RSVPForm({
    data,
    code,
    editing,
    onSubmitted,
    onCancel,
}: {
    data: EventDetails
    code: string
    editing?: RSVPResponse
    onSubmitted: (response: RSVPResponse) => void
    onCancel: () => void
}) {
    // Pre-select from either the response being edited, or the last set of
    // attendees this user RSVPed for in this event.
    //
    // For the non-editing case, we explicitly exclude anyone who is already in
    // SOME response. Otherwise clicking "RSVP for someone else" would pre-
    // select your previous attendees (now sitting in a response) and submit
    // would 409 / silently move them. The pills would also be hidden behind
    // the "Update an existing RSVP" link, so the user wouldn't even see what
    // they had selected. Edit mode skips this filter because the editing
    // response's own attendees are obviously fine to keep selected.
    const initialSelected = useMemo<Set<string>>(() => {
        if (editing) return new Set(editing.attendee_ids)
        const last = readLastAttendees(data.slug)
        const respondedSet = new Set<string>()
        data.responses.forEach((r) => r.attendee_ids.forEach((aid) => respondedSet.add(aid)))
        const valid = last.filter(
            (id) => data.attendees.some((a) => a.id === id) && !respondedSet.has(id),
        )
        return new Set(valid)
    }, [editing, data.slug, data.attendees, data.responses])

    const [selected, setSelected] = useState<Set<string>>(initialSelected)
    const [pendingNames, setPendingNames] = useState<string[]>([])
    const [status, setStatus] = useState<ResponseStatus>(editing?.status ?? 'attending')
    const [note, setNote] = useState(editing?.status_note ?? '')
    const [additionalGuests, setAdditionalGuests] = useState(editing?.additional_guests ?? 0)
    const [showExisting, setShowExisting] = useState(!!editing) // open the "update existing" panel by default when editing
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [conflicts, setConflicts] = useState<Array<{ attendee_id: string; existing_response_id: string }> | null>(
        null,
    )

    const attendeesByID = useMemo(() => new Map(data.attendees.map((a) => [a.id, a])), [data.attendees])
    const respByID = useMemo(() => new Map(data.responses.map((r) => [r.id, r])), [data.responses])
    const respByAttendee = useMemo(() => {
        const m = new Map<string, RSVPResponse>()
        data.responses.forEach((r) => r.attendee_ids.forEach((aid) => m.set(aid, r)))
        return m
    }, [data.responses])
    const existingNameSet = useMemo(
        () => new Set(data.attendees.map((a) => a.name.toLowerCase())),
        [data.attendees],
    )

    function toggle(id: string) {
        const next = new Set(selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelected(next)
    }

    function commitName(raw: string) {
        const name = raw.trim()
        if (!name) return
        const match = data.attendees.find((a) => a.name.toLowerCase() === name.toLowerCase())
        if (match) {
            const next = new Set(selected)
            next.add(match.id)
            setSelected(next)
            // If the matched attendee is hidden behind the "Update existing"
            // collapse, auto-expand it so the user can see their selection
            // landed somewhere visible.
            if (respByAttendee.has(match.id)) {
                setShowExisting(true)
            }
            return
        }
        if (pendingNames.some((n) => n.toLowerCase() === name.toLowerCase())) return
        setPendingNames([...pendingNames, name])
    }

    async function submit(merge = false) {
        setErr(null)
        setBusy(true)
        try {
            const ids: string[] = Array.from(selected)
            for (const n of pendingNames) {
                const r = await api<{ attendee: Attendee }>(`/api/event/${data.slug}/attendee`, {
                    method: 'PUT',
                    body: { name: n },
                    code,
                })
                ids.push(r.attendee.id)
            }
            if (ids.length === 0) {
                setErr('select at least one attendee, or type a new name')
                setBusy(false)
                return
            }
            const uniq = Array.from(new Set(ids))
            const path = `/api/event/${data.slug}/response${merge ? '?merge=1' : ''}`
            const response = await api<RSVPResponse>(path, {
                method: 'PUT',
                body: {
                    id: editing?.id,
                    attendee_ids: uniq,
                    status,
                    status_note: note || null,
                    additional_guests: additionalGuests,
                },
                code,
            })
            onSubmitted(response)
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                const body = e.body as { conflicts?: Array<{ attendee_id: string; existing_response_id: string }> }
                if (body?.conflicts) {
                    setConflicts(body.conflicts)
                    setBusy(false)
                    return
                }
            }
            setErr(e instanceof Error ? e.message : 'submit failed')
        } finally {
            setBusy(false)
        }
    }

    if (conflicts) {
        return (
            <div className="stack">
                <p>
                    These people are already in another response. Move them into this one? Empty old responses will be deleted.
                </p>
                <ul>
                    {conflicts.map((c) => {
                        const a = attendeesByID.get(c.attendee_id)
                        const r = respByID.get(c.existing_response_id)
                        return (
                            <li key={c.attendee_id}>
                                <strong>{a?.name ?? c.attendee_id}</strong> - currently in a response marked{' '}
                                <em>{r?.status ?? '?'}</em>
                            </li>
                        )
                    })}
                </ul>
                {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
                <div className="row">
                    <button onClick={() => submit(true)} disabled={busy}>
                        Yes, move them
                    </button>
                    <button className="secondary" onClick={() => setConflicts(null)}>
                        Back
                    </button>
                </div>
            </div>
        )
    }

    const unresponded = data.attendees.filter((a) => !respByAttendee.has(a.id))
    const responded = data.attendees.filter((a) => respByAttendee.has(a.id))

    return (
        <div className="stack">
            <div>
                <label style={{ display: 'block', marginBottom: '0.5em' }}>Who is this response for?</label>
                {data.attendees.length === 0 && <p className="muted">No one on the guest list yet. Add yourself below.</p>}

                {unresponded.length > 0 && (
                    <PillRow attendees={unresponded} selected={selected} onToggle={toggle} />
                )}

                <NameAdder
                    suggestions={data.attendees}
                    existingNames={existingNameSet}
                    pendingNames={pendingNames}
                    onCommit={commitName}
                    onRemovePending={(n) =>
                        setPendingNames(pendingNames.filter((x) => x.toLowerCase() !== n.toLowerCase()))
                    }
                />

                {responded.length > 0 && (
                    <div style={{ marginTop: '0.6em' }}>
                        <button
                            type="button"
                            className="btn-link"
                            onClick={() => setShowExisting((v) => !v)}
                        >
                            {showExisting ? 'Hide existing RSVPs' : 'Update an existing RSVP'}
                        </button>
                        {showExisting && (
                            <div style={{ marginTop: '0.5em' }}>
                                <PillRow
                                    attendees={responded}
                                    selected={selected}
                                    onToggle={toggle}
                                    statusFor={(a) => respByAttendee.get(a.id)?.status}
                                />
                                <p className="muted" style={{ fontSize: '0.85em', margin: '0.35em 0 0' }}>
                                    Selecting one will move them into this response.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5em' }}>Status</label>
                <SegmentedControl value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5em' }}>
                    Additional guests
                    <span className="muted" style={{ marginLeft: '0.5em', fontWeight: 400, fontSize: '0.85em' }}>
                        people not on the guest list who are coming along
                    </span>
                </label>
                <div className="row">
                    <button
                        type="button"
                        onClick={() => setAdditionalGuests((n) => n + 1)}
                        style={{ borderRadius: 999, padding: '0.4em 1em' }}
                    >
                        +1
                    </button>
                    <span style={{ fontSize: '1.1em', fontWeight: 600, minWidth: '3em' }}>
                        {additionalGuests > 0 ? `+${additionalGuests}` : '0'}
                    </span>
                    {additionalGuests > 0 && (
                        <button type="button" className="secondary" onClick={() => setAdditionalGuests(0)}>
                            Reset
                        </button>
                    )}
                </div>
            </div>

            <label>
                Note (optional)
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Bringing a +1, allergic to peanuts, etc."
                />
            </label>

            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            <div className="row">
                <button onClick={() => submit(false)} disabled={busy}>
                    {busy ? '...' : editing ? 'Save changes' : 'Submit RSVP'}
                </button>
                <button className="secondary" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    )
}

function PillRow({
    attendees,
    selected,
    onToggle,
    statusFor,
}: {
    attendees: Attendee[]
    selected: Set<string>
    onToggle: (id: string) => void
    statusFor?: (a: Attendee) => ResponseStatus | undefined
}) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em' }}>
            {attendees.map((a) => {
                const isSel = selected.has(a.id)
                const st = statusFor?.(a)
                return (
                    <button
                        key={a.id}
                        type="button"
                        className="btn-bare"
                        onClick={() => onToggle(a.id)}
                        style={{
                            background: isSel ? 'var(--accent)' : 'var(--surface)',
                            color: isSel ? 'var(--accent-ink)' : 'var(--text)',
                            border: `2px solid var(--ink)`,
                            borderRadius: 999,
                            padding: '0.3em 0.85em',
                            fontSize: '0.95em',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4em',
                            cursor: 'pointer',
                        }}
                    >
                        {a.name}
                        {st && (
                            <span style={{ fontSize: '0.75em', opacity: 0.75 }}>
                                ({st.replace('_', ' ')})
                            </span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

function NameAdder({
    suggestions,
    existingNames,
    pendingNames,
    onCommit,
    onRemovePending,
}: {
    suggestions: Attendee[]
    existingNames: Set<string>
    pendingNames: string[]
    onCommit: (name: string) => void
    onRemovePending: (name: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const matches = useMemo(() => {
        const q = value.trim().toLowerCase()
        if (!q) return []
        return suggestions
            .filter((a) => a.name.toLowerCase().includes(q) && a.name.toLowerCase() !== q)
            .slice(0, 6)
    }, [value, suggestions])

    function commitAndClear(raw: string) {
        const trimmed = raw.trim()
        if (!trimmed) return
        onCommit(trimmed)
        setValue('')
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commitAndClear(value)
        } else if (e.key === 'Backspace' && !value && pendingNames.length > 0) {
            onRemovePending(pendingNames[pendingNames.length - 1])
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value
        if (v.includes(',')) {
            const parts = v.split(',')
            const last = parts.pop() ?? ''
            for (const p of parts) commitAndClear(p)
            setValue(last)
        } else {
            setValue(v)
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                className="btn-bare"
                onClick={() => {
                    setOpen(true)
                    setTimeout(() => inputRef.current?.focus(), 0)
                }}
                style={{
                    background: 'transparent',
                    border: '2px dashed var(--ink)',
                    color: 'var(--muted)',
                    borderRadius: 999,
                    padding: '0.3em 0.85em',
                    fontSize: '0.95em',
                    marginTop: '0.5em',
                    cursor: 'pointer',
                }}
            >
                + Add someone new
            </button>
        )
    }

    return (
        <div
            style={{
                marginTop: '0.5em',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.5em',
                background: 'var(--surface-alt)',
            }}
        >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em', alignItems: 'center' }}>
                {pendingNames.map((n) => (
                    <span
                        key={n}
                        style={{
                            background: 'var(--accent)',
                            color: 'white',
                            borderRadius: 999,
                            padding: '0.3em 0.7em',
                            fontSize: '0.9em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35em',
                        }}
                    >
                        {n}
                        <button
                            type="button"
                            className="btn-bare"
                            onClick={() => onRemovePending(n)}
                            style={{
                                color: 'var(--accent-ink)',
                                fontSize: '1.1em',
                                lineHeight: 1,
                                cursor: 'pointer',
                            }}
                            aria-label={`Remove ${n}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKey}
                    onBlur={() => {
                        if (value.trim()) commitAndClear(value)
                    }}
                    placeholder={pendingNames.length === 0 ? 'Type a name, press Enter or comma to add' : 'Add another...'}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        padding: '0.3em 0.4em',
                        flex: 1,
                        minWidth: 180,
                        outline: 'none',
                        boxShadow: 'none',
                    }}
                />
            </div>
            {matches.length > 0 && (
                <div
                    style={{
                        marginTop: '0.4em',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.3em',
                        fontSize: '0.85em',
                    }}
                >
                    <span className="muted">Existing:</span>
                    {matches.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            className="btn-bare"
                            onMouseDown={(e) => {
                                e.preventDefault()
                                commitAndClear(a.name)
                            }}
                            style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--ink)',
                                color: 'var(--text)',
                                borderRadius: 999,
                                padding: '0.2em 0.65em',
                                cursor: 'pointer',
                            }}
                        >
                            {a.name}
                        </button>
                    ))}
                </div>
            )}
            {value.trim() && existingNames.has(value.trim().toLowerCase()) && (
                <p className="muted" style={{ fontSize: '0.8em', marginTop: '0.4em', marginBottom: 0 }}>
                    {value.trim()} already exists - will be selected, not duplicated.
                </p>
            )}
        </div>
    )
}

// ----- Roster -----
// Per request: every attendee appears as a pill under their current status.
// Responses that have a note get a separate "Notes" section beneath, so the
// note text is easy to scan without expanding rows. Some name repetition is
// intentional (you see Seth in "Attending" and again in the note row).

function ResponseRoster({ data }: { data: EventDetails }) {
    const attendeeName = (id: string) => data.attendees.find((a) => a.id === id)?.name ?? id

    const respByAttendee = new Map<string, RSVPResponse>()
    data.responses.forEach((r) => r.attendee_ids.forEach((aid) => respByAttendee.set(aid, r)))

    const grouped: Record<ResponseStatus, Attendee[]> = {
        invited: [],
        attending: [],
        maybe: [],
        not_attending: [],
    }
    data.attendees.forEach((a) => {
        const r = respByAttendee.get(a.id)
        const k: ResponseStatus = r ? r.status : 'invited'
        grouped[k].push(a)
    })

    // Sum additional_guests by status, for the "+N guests" pill.
    const extraGuests: Record<ResponseStatus, number> = {
        invited: 0,
        attending: 0,
        maybe: 0,
        not_attending: 0,
    }
    data.responses.forEach((r) => {
        extraGuests[r.status] += r.additional_guests
    })

    const responsesWithNotes = data.responses.filter((r) => r.status_note && r.status_note.trim() !== '')

    const order: ResponseStatus[] = ['attending', 'maybe', 'not_attending']
    const labels: Record<ResponseStatus, string> = {
        attending: 'Attending',
        maybe: 'Maybe',
        not_attending: 'Not attending',
        invited: 'No response yet',
    }
    const colors: Record<ResponseStatus, string> = {
        attending: '#2e8b57',
        maybe: '#c98e1d',
        not_attending: '#a02d22',
        invited: 'var(--muted)',
    }

    return (
        <section className="card stack" style={{ marginTop: '1.5em' }}>
            <h2 style={{ marginTop: 0 }}>Who's coming</h2>

            {order.map((st) => {
                const count = grouped[st].length + extraGuests[st]
                if (count === 0) return null
                return (
                    <StatusRow
                        key={st}
                        label={labels[st]}
                        color={colors[st]}
                        count={count}
                        attendees={grouped[st]}
                        extraGuests={extraGuests[st]}
                    />
                )
            })}

            {grouped.invited.length > 0 && (
                <StatusRow
                    label={labels.invited}
                    color={colors.invited}
                    count={grouped.invited.length}
                    attendees={grouped.invited}
                    extraGuests={0}
                />
            )}

            {responsesWithNotes.length > 0 && (
                <div>
                    <h3 style={{ margin: '0.75em 0 0.6em' }}>Notes</h3>
                    <div className="stack" style={{ gap: '0.75em' }}>
                        {responsesWithNotes.map((r) => (
                            <div
                                key={r.id}
                                style={{
                                    position: 'relative',
                                    background: 'var(--surface)',
                                    border: '2px solid var(--ink)',
                                    boxShadow: 'var(--shadow-sm)',
                                    borderRadius: 'var(--radius)',
                                    padding: '0.85em 1em 0.85em 1.25em',
                                    overflow: 'hidden',
                                }}
                            >
                                <span
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 8,
                                        background: colors[r.status],
                                    }}
                                />
                                <div className="row" style={{ gap: '0.5em' }}>
                                    <strong>{r.attendee_ids.map(attendeeName).join(', ')}</strong>
                                    {r.additional_guests > 0 && (
                                        <span className="muted">+{r.additional_guests}</span>
                                    )}
                                    <span
                                        style={{
                                            color: colors[r.status],
                                            fontSize: '0.8em',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.06em',
                                        }}
                                    >
                                        {labels[r.status]}
                                    </span>
                                </div>
                                <div style={{ marginTop: '0.4em' }}>"{r.status_note}"</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data.attendees.length === 0 && <p className="muted">No one on the guest list yet.</p>}
        </section>
    )
}

function StatusRow({
    label,
    color,
    count,
    attendees,
    extraGuests,
}: {
    label: string
    color: string
    count: number
    attendees: Attendee[]
    extraGuests: number
}) {
    return (
        <div>
            <h3 style={{ margin: '0.5em 0', color }}>
                {label} ({count})
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em' }}>
                {attendees.map((a) => (
                    <span
                        key={a.id}
                        style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 999,
                            padding: '0.25em 0.75em',
                            fontSize: '0.9em',
                        }}
                    >
                        {a.name}
                    </span>
                ))}
                {extraGuests > 0 && (
                    <span
                        style={{
                            background: 'var(--surface-alt)',
                            border: '1px dashed var(--border)',
                            color: 'var(--muted)',
                            borderRadius: 999,
                            padding: '0.25em 0.75em',
                            fontSize: '0.9em',
                        }}
                    >
                        +{extraGuests} guest{extraGuests === 1 ? '' : 's'}
                    </span>
                )}
            </div>
        </div>
    )
}

