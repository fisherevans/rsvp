import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { consumeRedirect } from '../lib/authRedirect'
import type { Event } from '../lib/types'
import { formatEventWhenDisplay } from '../lib/format'
import { useDocumentTitle } from '../lib/title'

export default function ManageList() {
    useDocumentTitle('Manage · RSVP')
    const [authed, setAuthed] = useState<boolean | null>(null)
    const [events, setEvents] = useState<Event[] | null>(null)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        api<{ authenticated: boolean }>('/api/manage/me')
            .then(() => setAuthed(true))
            .catch(() => setAuthed(false))
    }, [])

    useEffect(() => {
        if (!authed) return
        api<{ events: Event[] | null }>('/api/manage/events')
            .then((r) => setEvents(r.events ?? []))
            .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
    }, [authed])

    if (authed === null) return <div className="container">Loading...</div>
    if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />

    return (
        <div className="container">
            <div
                className="row"
                style={{ justifyContent: 'space-between', marginBottom: '1.5em' }}
            >
                <h1 style={{ marginBottom: 0 }}>Events</h1>
                <div className="row" style={{ gap: '0.5em' }}>
                    <Link to="/manage/audit">
                        <button type="button" className="secondary">
                            Audit
                        </button>
                    </Link>
                    <Link to="/manage/new">
                        <button type="button">+ New event</button>
                    </Link>
                </div>
            </div>
            {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
            {events && events.length === 0 && <p className="muted">No events yet.</p>}
            <div className="stack">
                {events?.map((e) => (
                    <Link
                        key={e.id}
                        to={`/manage/event/${e.slug}`}
                        className="card"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        <h2 style={{ margin: 0 }}>{e.name}</h2>
                        <p className="muted" style={{ margin: '0.25em 0 0' }}>
                            {formatEventWhenDisplay(e)}
                            {e.locked && (
                                <span style={{ marginLeft: '0.5em', color: 'var(--danger)', fontWeight: 700 }}>
                                    LOCKED
                                </span>
                            )}
                        </p>
                    </Link>
                ))}
            </div>
            <div style={{ marginTop: '3em', textAlign: 'center' }}>
                <button
                    type="button"
                    className="secondary btn-small"
                    onClick={async () => {
                        await api('/api/manage/logout', { method: 'POST' })
                        setAuthed(false)
                    }}
                >
                    Log out
                </button>
            </div>
        </div>
    )
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
    const nav = useNavigate()
    const [password, setPassword] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function submit(e: FormEvent) {
        e.preventDefault()
        setErr(null)
        setBusy(true)
        try {
            await api('/api/manage/login', { body: { password } })
            // If a page redirected here for auth, return there now.
            const target = consumeRedirect()
            if (target) {
                nav(target, { replace: true })
                return
            }
            onSuccess()
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : 'login failed')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="container" style={{ maxWidth: 400 }}>
            <h1>Manage</h1>
            <form onSubmit={submit} className="stack">
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                    />
                </label>
                {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
                <button type="submit" disabled={busy || !password}>
                    {busy ? '...' : 'Log in'}
                </button>
            </form>
        </div>
    )
}

