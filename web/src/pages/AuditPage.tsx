import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { stashRedirect } from '../lib/authRedirect'
import type { Event } from '../lib/types'
import { useDocumentTitle } from '../lib/title'

// Read-only view of the audit_log table. No editing, no revert tooling -
// just the rows so a future debugging session can find what changed when.

type AuditRow = {
    id: string
    event_id: string | null
    action: string
    target_id: string | null
    payload: string
    source_ip: string | null
    user_agent: string | null
    at: string
}

const ACTIONS = ['', 'attendee.put', 'attendee.delete', 'response.put', 'response.delete']

export default function AuditPage() {
    useDocumentTitle('Audit · RSVP')
    const nav = useNavigate()
    const [events, setEvents] = useState<Event[]>([])
    const [rows, setRows] = useState<AuditRow[]>([])
    const [eventID, setEventID] = useState('')
    const [action, setAction] = useState('')
    const [sourceIP, setSourceIP] = useState('')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [err, setErr] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    // Auth check + initial event list load.
    useEffect(() => {
        api<{ events: Event[] | null }>('/api/manage/events')
            .then((r) => setEvents(r.events ?? []))
            .catch((e) => {
                if (e instanceof ApiError && e.status === 401) {
                    stashRedirect('/manage/audit')
                    nav('/manage', { replace: true })
                } else {
                    setErr(e instanceof Error ? e.message : String(e))
                }
            })
    }, [nav])

    // Load audit rows whenever filters change.
    useEffect(() => {
        setLoading(true)
        const qs = new URLSearchParams()
        if (eventID) qs.set('event_id', eventID)
        if (action) qs.set('action', action)
        if (sourceIP) qs.set('source_ip', sourceIP)
        qs.set('limit', '500')
        api<{ entries: AuditRow[] }>(`/api/manage/audit?${qs.toString()}`)
            .then((r) => {
                setRows(r.entries)
                setErr(null)
            })
            .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
            .finally(() => setLoading(false))
    }, [eventID, action, sourceIP])

    const eventNameByID = useMemo(() => {
        const m = new Map<string, string>()
        events.forEach((e) => m.set(e.id, e.name))
        return m
    }, [events])

    function toggle(id: string) {
        const next = new Set(expanded)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setExpanded(next)
    }

    return (
        <div className="container" style={{ maxWidth: 1100 }}>
            <p>
                <Link to="/manage">&larr; All events</Link>
            </p>
            <h1>Audit Log</h1>
            <p className="muted" style={{ marginBottom: '1.5em' }}>
                Read-only history of attendee and response changes. {rows.length} rows shown.
            </p>

            <div
                className="row"
                style={{
                    gap: '0.75em',
                    marginBottom: '1em',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap',
                }}
            >
                <label style={{ minWidth: 200 }}>
                    Event
                    <select value={eventID} onChange={(e) => setEventID(e.target.value)}>
                        <option value="">All events</option>
                        {events.map((e) => (
                            <option key={e.id} value={e.id}>
                                {e.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label style={{ minWidth: 180 }}>
                    Action
                    <select value={action} onChange={(e) => setAction(e.target.value)}>
                        {ACTIONS.map((a) => (
                            <option key={a} value={a}>
                                {a === '' ? 'All actions' : a}
                            </option>
                        ))}
                    </select>
                </label>
                <label style={{ minWidth: 180 }}>
                    Source IP
                    <input
                        value={sourceIP}
                        onChange={(e) => setSourceIP(e.target.value)}
                        placeholder="e.g. 192.0.2.5"
                    />
                </label>
            </div>

            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            {loading && <p className="muted">Loading...</p>}
            {!loading && rows.length === 0 && (
                <p className="muted">No rows match the current filters.</p>
            )}

            {rows.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <table
                        style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.9em',
                        }}
                    >
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--ink)' }}>
                                <th style={th}>When</th>
                                <th style={th}>Action</th>
                                <th style={th}>Event</th>
                                <th style={th}>Target</th>
                                <th style={th}>Source IP</th>
                                <th style={th}>Payload</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const isOpen = expanded.has(r.id)
                                return (
                                    <tr
                                        key={r.id}
                                        style={{ borderBottom: '1px solid var(--border-soft)' }}
                                    >
                                        <td style={td} title={r.at}>
                                            {formatStamp(r.at)}
                                        </td>
                                        <td style={td}>
                                            <code>{r.action}</code>
                                        </td>
                                        <td style={td}>
                                            {r.event_id
                                                ? eventNameByID.get(r.event_id) ?? (
                                                      <code style={{ fontSize: '0.85em' }}>{r.event_id}</code>
                                                  )
                                                : ''}
                                        </td>
                                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.85em' }}>
                                            {r.target_id ?? ''}
                                        </td>
                                        <td style={td}>{r.source_ip ?? ''}</td>
                                        <td style={td}>
                                            <button
                                                type="button"
                                                className="btn-link"
                                                onClick={() => toggle(r.id)}
                                            >
                                                {isOpen ? 'hide' : 'show'}
                                            </button>
                                            {isOpen && (
                                                <pre
                                                    style={{
                                                        marginTop: '0.4em',
                                                        background: 'var(--surface-alt)',
                                                        border: '1px solid var(--border-soft)',
                                                        borderRadius: 4,
                                                        padding: '0.6em 0.8em',
                                                        fontSize: '0.8em',
                                                        maxHeight: 320,
                                                        overflow: 'auto',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                    }}
                                                >
                                                    {prettyJSON(r.payload)}
                                                </pre>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const th: React.CSSProperties = {
    padding: '0.5em 0.4em',
    textTransform: 'uppercase',
    fontSize: '0.8em',
    letterSpacing: '0.04em',
    color: 'var(--text)',
}

const td: React.CSSProperties = {
    padding: '0.55em 0.4em',
    verticalAlign: 'top',
}

function formatStamp(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    })
}

function prettyJSON(s: string): string {
    try {
        return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
        return s
    }
}
