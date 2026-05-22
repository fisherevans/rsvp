import { useRef, useState } from 'react'

// ImageSlot is the upload widget for the management theme section.
//
// Two ways to upload: the native file picker (via the visible
// <input type="file">), and drag-and-drop onto the slot. Both feed the same
// handleFile.
//
// Drag-and-drop is intentional defensive coverage - on some setups the OS
// file picker doesn't open from a click, but drag-and-drop is a different
// browser API that almost always works.

export function ImageSlot({
    label,
    hint,
    eventSlug,
    value,
    onChange,
    aspect = 'landscape',
}: {
    label: string
    hint?: string
    eventSlug: string
    value: string | null
    onChange: (url: string | null) => void
    aspect?: 'landscape' | 'square'
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [progress, setProgress] = useState<number | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)

    async function handleFile(file: File) {
        setBusy(true)
        setErr(null)
        setProgress(null)
        const form = new FormData()
        form.append('file', file)
        try {
            const res = await fetch(`/api/manage/event/${eventSlug}/upload`, {
                method: 'POST',
                credentials: 'include',
                body: form,
            })
            const text = await res.text()
            if (!res.ok) {
                let msg = `upload failed (${res.status})`
                try {
                    const body = JSON.parse(text) as { error?: string }
                    if (body.error) msg = body.error
                } catch {
                    /* keep default */
                }
                setErr(msg)
                return
            }
            const body = JSON.parse(text) as { url: string }
            onChange(body.url)
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'upload failed')
        } finally {
            setBusy(false)
            setProgress(null)
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) handleFile(f)
    }

    return (
        <div className="stack" style={{ gap: '0.5em' }}>
            <div>
                <strong>{label}</strong>
                {hint && (
                    <div className="muted" style={{ fontSize: '0.85em', marginTop: '0.15em' }}>
                        {hint}
                    </div>
                )}
            </div>
            <div
                onDragOver={(e) => {
                    e.preventDefault()
                    if (!dragOver) setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                    border: dragOver ? '2px dashed var(--accent)' : '1px dashed var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.75em',
                    background: dragOver ? 'color-mix(in srgb, var(--accent) 8%, var(--surface-alt))' : 'var(--surface-alt)',
                    display: 'flex',
                    gap: '1em',
                    alignItems: 'center',
                    transition: 'background 0.1s, border-color 0.1s',
                }}
            >
                <div
                    style={{
                        flex: '0 0 auto',
                        width: aspect === 'square' ? 96 : 180,
                        height: aspect === 'square' ? 96 : 96,
                        borderRadius: 6,
                        background: value
                            ? `url(${value}) center/cover no-repeat`
                            : 'var(--surface)',
                        border: '1px solid var(--border)',
                    }}
                />
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5em',
                    }}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        className="file-input"
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleFile(f)
                        }}
                    />
                    <span className="muted" style={{ fontSize: '0.8em' }}>
                        ...or drag an image here
                    </span>
                    {busy && (
                        <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>
                            {progress !== null && progress < 100
                                ? `Uploading ${progress}%...`
                                : 'Uploading...'}
                        </span>
                    )}
                    {value && !busy && (
                        <div className="row" style={{ gap: '0.5em' }}>
                            <button
                                type="button"
                                className="secondary btn-small"
                                onClick={() => onChange(null)}
                            >
                                Clear
                            </button>
                            <code style={{ fontSize: '0.75em', wordBreak: 'break-all' }}>{value}</code>
                        </div>
                    )}
                    {err && <span style={{ color: 'var(--danger)', fontSize: '0.85em' }}>{err}</span>}
                </div>
            </div>
        </div>
    )
}
