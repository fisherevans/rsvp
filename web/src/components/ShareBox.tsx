import { useState } from 'react'
import { Copy, Check, DownloadSimple } from '@phosphor-icons/react'
import type { EventDetails } from '../lib/types'
import { formatShareWhen } from '../lib/format'

// ShareBox is the share modal body. Surfaces:
//   - Include-access-code toggle
//   - URL row with inline copy icon
//   - Code row with inline copy icon
//   - Share... button (uses navigator.share when available, falls back to
//     copying a multi-line text block)
//   - QR image
//
// Both the URL and the code are copyable inline (no separate "Copy URL"
// button). The QR re-renders when includeCode toggles thanks to a key on the
// img so a browser cache miss is forced.
export function ShareBox({ event, code }: { event: EventDetails; code: string }) {
    const [includeCode, setIncludeCode] = useState(true)
    const [copied, setCopied] = useState<'url' | 'code' | 'share' | 'qr' | null>(null)

    const baseURL = `${window.location.origin}/event/${event.slug}`
    const url = includeCode ? `${baseURL}?code=${encodeURIComponent(code)}` : baseURL
    const qrURL = `/api/event/${event.slug}/qr.png?code=${encodeURIComponent(code)}${includeCode ? '' : '&include_code=0'}`

    function flash(which: 'url' | 'code' | 'share' | 'qr') {
        setCopied(which)
        setTimeout(() => setCopied(null), 1500)
    }

    function copyURL() {
        navigator.clipboard.writeText(url).then(() => flash('url'))
    }
    function copyCode() {
        navigator.clipboard.writeText(code).then(() => flash('code'))
    }

    async function copyQRImage() {
        try {
            const res = await fetch(qrURL)
            const blob = await res.blob()
            // ClipboardItem with the image blob - supported in Chrome/Safari
            // and Firefox 127+. Older browsers will throw, handled below.
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
            ])
            flash('qr')
        } catch {
            // Fallback: open the image in a new tab so the user can save it
            // manually with the browser's image context menu.
            window.open(qrURL, '_blank', 'noopener,noreferrer')
        }
    }

    async function share() {
        const text = `${event.name}\n${formatShareWhen(event)}`
        if (navigator.share) {
            try {
                await navigator.share({ title: event.name, text, url })
                return
            } catch {
                // fall through to clipboard
            }
        }
        navigator.clipboard.writeText(`${text}\n${url}`)
        flash('share')
    }

    return (
        <div className="stack">
            <label className="row" style={{ gap: '0.5em', cursor: 'pointer', flexWrap: 'wrap' }}>
                <input
                    type="checkbox"
                    checked={includeCode}
                    onChange={(e) => setIncludeCode(e.target.checked)}
                />
                <span>Include access code in link</span>
            </label>
            <p className="muted" style={{ margin: 0, fontSize: '0.85em' }}>
                {includeCode
                    ? 'Recipients can open the link directly.'
                    : 'Recipients will need to enter the code manually.'}
            </p>

            <CopyRow label="URL" value={url} copied={copied === 'url'} onCopy={copyURL} mono />
            <CopyRow label="Code" value={code} copied={copied === 'code'} onCopy={copyCode} big />

            <button onClick={share}>{copied === 'share' ? 'Copied!' : 'Share...'}</button>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5em',
                }}
            >
                <img
                    key={qrURL}
                    src={qrURL}
                    alt="QR code"
                    style={{
                        width: '100%',
                        maxWidth: 240,
                        height: 'auto',
                        aspectRatio: '1 / 1',
                        background: 'white',
                        border: '2px solid var(--ink)',
                        borderRadius: 6,
                        padding: 8,
                    }}
                />
                <div className="row" style={{ gap: '0.4em', justifyContent: 'center' }}>
                    <a
                        href={qrURL}
                        download={`${event.slug}-qr.png`}
                        className="btn-link"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35em',
                        }}
                    >
                        <DownloadSimple size={16} weight="bold" />
                        Download
                    </a>
                    <span className="muted" style={{ fontSize: '0.85em' }}>·</span>
                    <button
                        type="button"
                        className="btn-link"
                        onClick={copyQRImage}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35em',
                        }}
                    >
                        {copied === 'qr' ? (
                            <>
                                <Check size={16} weight="bold" />
                                Copied
                            </>
                        ) : (
                            <>
                                <Copy size={16} weight="bold" />
                                Copy image
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

function CopyRow({
    label,
    value,
    copied,
    onCopy,
    mono,
    big,
}: {
    label: string
    value: string
    copied: boolean
    onCopy: () => void
    mono?: boolean
    big?: boolean
}) {
    return (
        <div>
            <div className="muted" style={{ fontSize: '0.85em', marginBottom: '0.25em' }}>
                {label}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5em',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '0.5em 0.75em',
                }}
            >
                <span
                    style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
                        fontSize: big ? '1.4em' : '0.95em',
                        fontWeight: big ? 600 : 400,
                        letterSpacing: big ? '0.05em' : undefined,
                        wordBreak: 'break-all',
                    }}
                >
                    {value}
                </span>
                <button
                    type="button"
                    className="btn-bare"
                    onClick={onCopy}
                    aria-label={`Copy ${label.toLowerCase()}`}
                    title={`Copy ${label.toLowerCase()}`}
                    style={{
                        color: copied ? 'var(--good)' : 'var(--muted)',
                        padding: '0.4em',
                        cursor: 'pointer',
                        flex: '0 0 auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    {copied ? <Check size={20} weight="bold" /> : <Copy size={20} />}
                </button>
            </div>
        </div>
    )
}
