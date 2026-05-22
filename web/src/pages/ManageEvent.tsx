import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { stashRedirect } from '../lib/authRedirect'
import type { Event, EventDetails, Attendee, RSVPResponse, ResponseStatus } from '../lib/types'
import { renderMarkdownPreview } from '../lib/markdown'
import { ImageSlot } from '../components/ImageSlot'
import { FontSelect } from '../components/FontSelect'
import { ColorPaletteModal } from '../components/ColorPaletteModal'
import { SegmentedControl } from '../components/SegmentedControl'
import { ShareBox } from '../components/ShareBox'
import { CalendarMenu } from '../components/CalendarMenu'
import { AddressInput } from '../components/AddressInput'
import { SaveBar } from '../components/SaveBar'
import { EventDateTimeFields } from '../components/EventDateTimeFields'
import type { DateTimeValue } from '../components/EventDateTimeFields'
import { useDocumentTitle } from '../lib/title'

export default function ManageEvent() {
    const { slug = '' } = useParams()
    const [data, setData] = useState<EventDetails | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const nav = useNavigate()

    useDocumentTitle(data ? `Manage ${data.name} · RSVP` : 'Manage event · RSVP')

    const reload = useCallback(
        async (s: string) => {
            try {
                const ev = await api<Event>(`/api/manage/event/${s}`)
                const det = await api<EventDetails>(`/api/event/${s}/`, { code: ev.code })
                setData(det)
            } catch (e) {
                if (e instanceof ApiError && e.status === 401) {
                    stashRedirect(`/manage/event/${s}`)
                    nav('/manage', { replace: true })
                    return
                }
                setErr(e instanceof Error ? e.message : String(e))
            }
        },
        [nav],
    )

    useEffect(() => {
        reload(slug)
    }, [slug, reload])

    if (err) return <div className="container">Error: {err}</div>
    if (!data) return <div className="container">Loading...</div>

    return (
        <div className="container">
            <div
                className="row"
                style={{
                    justifyContent: 'space-between',
                    marginBottom: '2em',
                    fontSize: '0.9em',
                }}
            >
                <Link
                    to="/manage"
                    style={{ textDecoration: 'none' }}
                >
                    &larr; All events
                </Link>
                <a
                    href={`/event/${data.slug}?code=${encodeURIComponent(data.code)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                >
                    View event page ↗
                </a>
            </div>
            <h1>{data.name}</h1>
            {data.locked_effective && (
                <p className="card" style={{ borderColor: 'var(--danger)' }}>
                    This event is locked. Attendees can view but not modify.
                    {data.locked ? ' (manual lock)' : ' (past end time)'}
                </p>
            )}

            <BasicsForm
                event={data}
                onSaved={() => reload(data.slug)}
                onSlugChanged={(s) => nav(`/manage/event/${s}`, { replace: true })}
            />
            <DetailsEditor event={data} onSaved={() => reload(data.slug)} />
            <ThemeEditor event={data} onSaved={() => reload(data.slug)} />
            <AttendeesSection event={data} onChanged={() => reload(data.slug)} />
            <ResponsesSection event={data} onChanged={() => reload(data.slug)} />
            <SharePanel event={data} />
            <DangerZone event={data} onChanged={() => reload(data.slug)} onDeleted={() => nav('/manage')} />
        </div>
    )
}

function BasicsForm({
    event,
    onSaved,
    onSlugChanged,
}: {
    event: EventDetails
    onSaved: () => void
    onSlugChanged: (slug: string) => void
}) {
    const [name, setName] = useState(event.name)
    const [slug, setSlug] = useState(event.slug)
    const [dt, setDt] = useState<DateTimeValue>({
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        allDay: event.all_day,
        endTimeHidden: event.end_time_hidden,
        endCondition: event.end_condition,
    })
    const [tz, setTz] = useState(event.timezone)
    const [code, setCode] = useState(event.code)
    const [summary, setSummary] = useState(event.summary ?? '')
    const [address, setAddress] = useState(event.address ?? '')
    const [addressLabel, setAddressLabel] = useState(event.address_label ?? '')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [justSaved, setJustSaved] = useState(false)

    const dirty =
        name !== event.name ||
        slug !== event.slug ||
        dt.startsAt !== event.starts_at ||
        dt.endsAt !== event.ends_at ||
        dt.allDay !== event.all_day ||
        dt.endTimeHidden !== event.end_time_hidden ||
        (dt.endCondition ?? '') !== (event.end_condition ?? '') ||
        tz !== event.timezone ||
        code !== event.code ||
        summary !== (event.summary ?? '') ||
        address !== (event.address ?? '') ||
        addressLabel !== (event.address_label ?? '')

    async function save() {
        setErr(null)
        setBusy(true)
        try {
            const body = {
                name,
                slug,
                starts_at: dt.startsAt,
                ends_at: dt.endsAt,
                all_day: dt.allDay,
                end_time_hidden: dt.endTimeHidden,
                end_condition: dt.endCondition,
                timezone: tz,
                code,
                summary: summary || null,
                address: address || null,
                address_label: addressLabel || null,
            }
            const out = await api<Event>(`/api/manage/event/${event.slug}`, { method: 'PATCH', body })
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 2500)
            if (out.slug !== event.slug) {
                onSlugChanged(out.slug)
            } else {
                onSaved()
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'save failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="card stack">
            <h2 style={{ marginTop: 0 }}>Basics</h2>
            <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
                Slug
                <input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </label>
            {event.old_slugs && event.old_slugs.length > 0 && (
                <p className="muted" style={{ fontSize: '0.9em' }}>
                    Old URLs (auto-redirect): {event.old_slugs.join(', ')}
                </p>
            )}
            <EventDateTimeFields value={dt} timezone={tz} onChange={setDt} onTimezoneChange={setTz} />
            <label>
                Access code
                <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label>
                Short summary (shown in link previews; falls back to event details)
                <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Optional" />
            </label>
            <div>
                <label style={{ marginBottom: '0.35em' }}>Address</label>
                <AddressInput value={address} onChange={setAddress} placeholder="123 Main St, Madison, WI" />
                <p className="muted" style={{ fontSize: '0.85em', margin: '0.35em 0 0' }}>
                    Type at least 3 characters for suggestions. Used in the calendar invite and shown on the event page.
                </p>
            </div>
            <label>
                Address label (optional)
                <input
                    value={addressLabel}
                    onChange={(e) => setAddressLabel(e.target.value)}
                    placeholder="e.g. Fisher's home"
                />
            </label>
            <SaveBar label="Save basics" dirty={dirty} busy={busy} justSaved={justSaved} err={err} onSave={save} />
        </section>
    )
}

function DetailsEditor({ event, onSaved }: { event: EventDetails; onSaved: () => void }) {
    const [md, setMd] = useState(event.details_md)
    const [saved, setSaved] = useState(event.details_md)
    const [tab, setTab] = useState<'edit' | 'preview'>('edit')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [justSaved, setJustSaved] = useState(false)
    const taRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    // Keep local state in sync when the parent reloads with new server data.
    useEffect(() => {
        setMd(event.details_md)
        setSaved(event.details_md)
    }, [event.details_md])

    const dirty = md !== saved
    const previewHTML = useMemo(() => renderMarkdownPreview(md), [md])

    async function save() {
        setErr(null)
        setBusy(true)
        try {
            await api(`/api/manage/event/${event.slug}`, {
                method: 'PATCH',
                body: { details_md: md },
            })
            setSaved(md)
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 2500)
            onSaved()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'save failed')
        } finally {
            setBusy(false)
        }
    }

    async function uploadAndInsert(file: File) {
        setErr(null)
        try {
            const form = new FormData()
            form.append('file', file)
            const r = await api<{ url: string }>(`/api/manage/event/${event.slug}/upload`, { body: form })
            const ta = taRef.current
            const insert = `![${file.name}](${r.url})`
            if (ta) {
                const { selectionStart, selectionEnd } = ta
                const next = md.slice(0, selectionStart) + insert + md.slice(selectionEnd)
                setMd(next)
                setTimeout(() => {
                    ta.focus()
                    ta.selectionStart = ta.selectionEnd = selectionStart + insert.length
                }, 0)
            } else {
                setMd(md + '\n' + insert)
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'upload failed')
        }
    }

    return (
        <section className="card stack">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ marginTop: 0, marginBottom: 0 }}>Details</h2>
                <div className="row" style={{ gap: '0.4em' }}>
                    {(['edit', 'preview'] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={tab === t ? 'btn-small' : 'secondary btn-small'}
                        >
                            {t === 'edit' ? 'Edit' : 'Preview'}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'edit' ? (
                <>
                    <div className="row">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) uploadAndInsert(f)
                                e.target.value = ''
                            }}
                        />
                        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
                            Insert image
                        </button>
                        <span className="muted" style={{ fontSize: '0.85em' }}>
                            Markdown: <code>**bold**</code> <code>*italic*</code> <code># Heading</code> <code>[link](url)</code>
                        </span>
                    </div>
                    <textarea
                        ref={taRef}
                        value={md}
                        onChange={(e) => setMd(e.target.value)}
                        rows={14}
                        placeholder="Markdown content for the event page. Click 'Preview' to see it rendered."
                    />
                </>
            ) : (
                <div
                    className="markdown-body"
                    style={{
                        minHeight: '18em',
                        padding: '1em',
                        background: 'var(--surface-alt)',
                        borderRadius: 'var(--radius)',
                    }}
                    dangerouslySetInnerHTML={{ __html: previewHTML || '<p class="muted">(empty)</p>' }}
                />
            )}

            <SaveBar label="Save details" dirty={dirty} busy={busy} justSaved={justSaved} err={err} onSave={save} />
        </section>
    )
}

function ThemeEditor({ event, onSaved }: { event: EventDetails; onSaved: () => void }) {
    const [accent, setAccent] = useState(event.theme_accent ?? '#4a6bdf')
    const [titleFont, setTitleFont] = useState<string | null>(event.title_font)
    const [textFont, setTextFont] = useState<string | null>(event.text_font)
    const [titleScale, setTitleScale] = useState(event.title_scale || 1)
    const [textScale, setTextScale] = useState(event.text_scale || 1)
    const [titleCase, setTitleCase] = useState<'normal' | 'upper' | 'lower'>(event.title_case || 'normal')
    const [poster, setPoster] = useState<string | null>(event.poster_image)
    const [header, setHeader] = useState<string | null>(event.theme_header_image)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [justSaved, setJustSaved] = useState(false)

    const dirty =
        accent !== (event.theme_accent ?? '#4a6bdf') ||
        titleFont !== event.title_font ||
        textFont !== event.text_font ||
        Math.abs(titleScale - (event.title_scale || 1)) > 0.001 ||
        Math.abs(textScale - (event.text_scale || 1)) > 0.001 ||
        titleCase !== (event.title_case || 'normal') ||
        poster !== event.poster_image ||
        header !== event.theme_header_image

    async function save() {
        setErr(null)
        setBusy(true)
        try {
            await api(`/api/manage/event/${event.slug}`, {
                method: 'PATCH',
                body: {
                    theme_accent: accent || null,
                    title_font: titleFont || null,
                    text_font: textFont || null,
                    title_scale: titleScale,
                    text_scale: textScale,
                    title_case: titleCase,
                    poster_image: poster || null,
                    theme_header_image: header || null,
                },
            })
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 2500)
            onSaved()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'save failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="card stack">
            <h2 style={{ marginTop: 0 }}>Theme</h2>
            <div>
                <label style={{ marginBottom: '0.5em' }}>Accent color</label>
                <ColorPaletteModal value={accent} onChange={setAccent} />
            </div>
            <div className="row" style={{ gap: '1em', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: 240 }}>
                    Title font
                    <FontSelect value={titleFont} onChange={setTitleFont} />
                </label>
                <label style={{ flex: 1, minWidth: 240 }}>
                    Text font
                    <FontSelect value={textFont} onChange={setTextFont} />
                </label>
            </div>
            <div className="row" style={{ gap: '1em', flexWrap: 'wrap' }}>
                <ScaleSlider label="Title size" value={titleScale} onChange={setTitleScale} />
                <ScaleSlider label="Text size" value={textScale} onChange={setTextScale} />
            </div>
            <div>
                <label style={{ marginBottom: '0.5em' }}>Title case</label>
                <SegmentedControl
                    value={titleCase}
                    onChange={setTitleCase}
                    options={[
                        { value: 'normal', label: 'Standard' },
                        { value: 'upper', label: 'UPPER' },
                        { value: 'lower', label: 'lower' },
                    ]}
                />
            </div>
            <ThemePreview
                accent={accent}
                titleFont={titleFont}
                textFont={textFont}
                titleScale={titleScale}
                textScale={textScale}
                titleCase={titleCase}
                eventName={event.name}
            />
            <ImageSlot
                label="Header image"
                hint="Wide banner shown at the top of the public event page."
                eventSlug={event.slug}
                value={header}
                onChange={setHeader}
                aspect="landscape"
            />
            <ImageSlot
                label="Poster image"
                hint="Square-ish image used as the link preview in iMessage/Discord/Slack. 1.91:1 aspect works best."
                eventSlug={event.slug}
                value={poster}
                onChange={setPoster}
                aspect="square"
            />
            <SaveBar label="Save theme" dirty={dirty} busy={busy} justSaved={justSaved} err={err} onSave={save} />
        </section>
    )
}

function ThemePreview({
    accent,
    titleFont,
    textFont,
    titleScale,
    textScale,
    titleCase,
    eventName,
}: {
    accent: string
    titleFont: string | null
    textFont: string | null
    titleScale: number
    textScale: number
    titleCase: 'normal' | 'upper' | 'lower'
    eventName: string
}) {
    const titleFamily = titleFont ? `"${titleFont}", system-ui, sans-serif` : 'inherit'
    const textFamily = textFont ? `"${textFont}", system-ui, sans-serif` : 'inherit'
    const transform = titleCase === 'upper' ? 'uppercase' : titleCase === 'lower' ? 'lowercase' : 'none'

    return (
        <div>
            <label style={{ marginBottom: '0.5em' }}>Preview</label>
            <div
                style={{
                    background: 'var(--surface)',
                    border: '2px solid var(--ink)',
                    borderRadius: 'var(--radius)',
                    padding: '1.25em',
                    boxShadow: 'var(--shadow-sm)',
                }}
            >
                <div
                    style={{
                        fontFamily: titleFamily,
                        fontWeight: 800,
                        fontSize: `calc(2rem * ${titleScale})`,
                        lineHeight: 1.15,
                        textTransform: transform,
                        letterSpacing: 0,
                        color: 'var(--text)',
                        marginBottom: '0.3em',
                    }}
                >
                    {eventName || 'Your event name'}
                </div>
                <div
                    style={{
                        fontFamily: titleFamily,
                        fontWeight: 700,
                        fontSize: `calc(1.05rem * ${titleScale})`,
                        textTransform: transform,
                        letterSpacing: 0,
                        color: accent,
                        marginBottom: '0.85em',
                        lineHeight: 1.2,
                    }}
                >
                    This Friday @ 5pm
                </div>
                <p
                    style={{
                        fontFamily: textFamily,
                        fontSize: `calc(1rem * ${textScale})`,
                        margin: '0 0 1em',
                        lineHeight: 1.6,
                    }}
                >
                    Body text picks up the text font and text size. Headings use the title font
                    and title size, plus the case treatment you picked above.
                </p>
                <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    style={{
                        background: accent,
                        color: '#fff',
                        border: '2px solid var(--ink)',
                        boxShadow: 'var(--shadow-sm)',
                        padding: '0.55em 1.1em',
                        fontFamily: textFamily,
                        fontWeight: 700,
                        cursor: 'default',
                        textTransform: 'none',
                        letterSpacing: 0,
                    }}
                >
                    RSVP
                </button>
            </div>
        </div>
    )
}

function ScaleSlider({
    label,
    value,
    onChange,
}: {
    label: string
    value: number
    onChange: (v: number) => void
}) {
    return (
        <label style={{ flex: 1, minWidth: 200 }}>
            <span className="row" style={{ justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span className="muted">{value.toFixed(2)}x</span>
            </span>
            <input
                type="range"
                min={0.8}
                max={1.6}
                step={0.05}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: '0.35em' }}
            />
        </label>
    )
}

function AttendeesSection({ event, onChanged }: { event: EventDetails; onChanged: () => void }) {
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function add() {
        if (!name.trim()) return
        setBusy(true)
        setErr(null)
        try {
            await api(`/api/event/${event.slug}/attendee`, { method: 'PUT', body: { name }, code: event.code })
            setName('')
            onChanged()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'add failed')
        } finally {
            setBusy(false)
        }
    }

    async function remove(a: Attendee) {
        if (!confirm(`Remove ${a.name}?`)) return
        try {
            await api(`/api/event/${event.slug}/attendee/${a.id}`, { method: 'DELETE', code: event.code })
            onChanged()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'delete failed')
        }
    }

    const respByAttendee = new Map<string, RSVPResponse>()
    event.responses.forEach((r) => r.attendee_ids.forEach((aid) => respByAttendee.set(aid, r)))

    return (
        <section className="card stack">
            <h2 style={{ marginTop: 0 }}>Attendees ({event.attendees.length})</h2>
            <div className="row">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Add attendee"
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                />
                <button onClick={add} disabled={busy || !name.trim() || event.locked_effective}>
                    Add
                </button>
            </div>
            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            {/* CSS columns auto-flow into 2 (or 1 on narrow phones) with a
                vertical rule between, keeping the Remove button visually
                close to its row rather than pushed to the page edge. */}
            <div
                style={{
                    columns: '280px auto',
                    columnGap: '2em',
                    columnRule: '1px solid var(--border-soft)',
                }}
            >
                {event.attendees.map((a) => {
                    const r = respByAttendee.get(a.id)
                    return (
                        <div
                            key={a.id}
                            style={{
                                breakInside: 'avoid',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.75em',
                                padding: '0.35em 0',
                            }}
                        >
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <strong>{a.name}</strong>
                                <span className="muted" style={{ marginLeft: '0.5em', fontSize: '0.9em' }}>
                                    {r ? r.status.replace('_', ' ') : 'no response'}
                                </span>
                            </div>
                            <button
                                className="secondary btn-small"
                                onClick={() => remove(a)}
                                disabled={event.locked_effective}
                            >
                                Remove
                            </button>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function ResponsesSection({ event, onChanged }: { event: EventDetails; onChanged: () => void }) {
    const attendeeName = (id: string) => event.attendees.find((a) => a.id === id)?.name ?? id

    async function del(r: RSVPResponse) {
        if (!confirm('Delete this response?')) return
        await api(`/api/event/${event.slug}/response/${r.id}`, { method: 'DELETE', code: event.code })
        onChanged()
    }

    const statusLabel: Record<ResponseStatus, string> = {
        invited: 'invited',
        maybe: 'maybe',
        not_attending: 'not attending',
        attending: 'attending',
    }
    const statusColor: Record<ResponseStatus, string> = {
        invited: 'var(--muted)',
        maybe: '#c98e1d',
        not_attending: '#a02d22',
        attending: '#2e8b57',
    }

    return (
        <section className="card stack">
            <h2 style={{ marginTop: 0 }}>Responses ({event.responses.length})</h2>
            {event.responses.length === 0 ? (
                <p className="muted">No responses yet.</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95em' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.5em 0.4em' }}>Names</th>
                                <th style={{ padding: '0.5em 0.4em' }}>Status</th>
                                <th style={{ padding: '0.5em 0.4em', textAlign: 'right' }}>+1s</th>
                                <th style={{ padding: '0.5em 0.4em' }}>Note</th>
                                <th style={{ padding: '0.5em 0.4em', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {event.responses.map((r) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.6em 0.4em' }}>
                                        <strong>{r.attendee_ids.map(attendeeName).join(', ')}</strong>
                                    </td>
                                    <td style={{ padding: '0.6em 0.4em', color: statusColor[r.status], fontWeight: 500 }}>
                                        {statusLabel[r.status]}
                                    </td>
                                    <td style={{ padding: '0.6em 0.4em', textAlign: 'right' }}>
                                        {r.additional_guests > 0 ? `+${r.additional_guests}` : ''}
                                    </td>
                                    <td style={{ padding: '0.6em 0.4em', color: 'var(--muted)' }}>
                                        {r.status_note ? `"${r.status_note}"` : ''}
                                    </td>
                                    <td style={{ padding: '0.6em 0.4em', textAlign: 'right' }}>
                                        <button
                                            className="secondary"
                                            onClick={() => del(r)}
                                            disabled={event.locked_effective}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

function SharePanel({ event }: { event: EventDetails }) {
    return (
        <section className="card stack">
            <h2 style={{ marginTop: 0 }}>Share</h2>
            <p className="muted" style={{ margin: 0 }}>
                Anyone with this URL can view + RSVP until the event is locked.
            </p>
            <ShareBox event={event} code={event.code} />
            <div className="row">
                <CalendarMenu event={event} code={event.code} />
                <a
                    href={`/event/${event.slug}?code=${encodeURIComponent(event.code)}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <button type="button" className="secondary">
                        Open public page
                    </button>
                </a>
            </div>
        </section>
    )
}

function DangerZone({
    event,
    onChanged,
    onDeleted,
}: {
    event: EventDetails
    onChanged: () => void
    onDeleted: () => void
}) {
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    // Transient confirmation messages keyed by action.
    const [lockFlash, setLockFlash] = useState<string | null>(null)
    const [regenFlash, setRegenFlash] = useState<string | null>(null)

    function flash(setter: (s: string | null) => void, msg: string) {
        setter(msg)
        setTimeout(() => setter(null), 2500)
    }

    async function lock() {
        setBusy(true)
        const willBeLocked = !event.locked
        try {
            const path = event.locked
                ? `/api/manage/event/${event.slug}/unlock`
                : `/api/manage/event/${event.slug}/lock`
            await api(path, { method: 'POST' })
            flash(setLockFlash, willBeLocked ? '✓ Locked' : '✓ Unlocked')
            onChanged()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'failed')
        } finally {
            setBusy(false)
        }
    }

    async function regen() {
        if (!confirm('Regenerate code? Everyone with the old link will need the new one.')) return
        try {
            const out = await api<{ code: string }>(`/api/manage/event/${event.slug}/regenerate-code`, {
                method: 'POST',
            })
            flash(setRegenFlash, `✓ New code: ${out.code}`)
            onChanged()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'failed')
        }
    }

    async function del() {
        if (!confirmDelete) {
            setConfirmDelete(true)
            return
        }
        try {
            await api(`/api/manage/event/${event.slug}`, { method: 'DELETE' })
            onDeleted()
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'failed')
        }
    }

    const flashStyle = {
        color: '#2e8b57',
        fontSize: '0.9em',
        fontWeight: 500,
    }

    return (
        <section className="card stack" style={{ borderColor: 'var(--danger)' }}>
            <h2 style={{ marginTop: 0 }}>Danger zone</h2>
            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            <div className="row">
                <button className="secondary" onClick={lock} disabled={busy}>
                    {event.locked ? 'Unlock (re-open mutations)' : 'Lock now (block mutations)'}
                </button>
                {lockFlash && <span style={flashStyle}>{lockFlash}</span>}
            </div>
            <div className="row">
                <button className="secondary" onClick={regen}>
                    Regenerate access code
                </button>
                {regenFlash && <span style={flashStyle}>{regenFlash}</span>}
            </div>
            <div className="row">
                <button className="danger" onClick={del}>
                    {confirmDelete ? 'Click again to confirm delete' : 'Delete event'}
                </button>
                {confirmDelete && (
                    <button className="secondary" onClick={() => setConfirmDelete(false)}>
                        Cancel
                    </button>
                )}
            </div>
        </section>
    )
}
