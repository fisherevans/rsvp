import { useEffect, useRef, useState } from 'react'

// AddressInput is a text field with autocomplete via Photon (OpenStreetMap-
// based, no API key, no auth). Suggestions appear under the input as the
// user types; clicking one fills the field.
//
// Photon: https://photon.komoot.io/api/?q=<query>&limit=5
//
// Photon is free for "fair use". For a personal event app this is fine.
// If we ever outgrow it, swap in MapBox or Google Places.

type PhotonFeature = {
    properties: {
        name?: string
        housenumber?: string
        street?: string
        city?: string
        state?: string
        country?: string
        postcode?: string
        type?: string
    }
}

export function AddressInput({
    value,
    onChange,
    placeholder = '123 Main St, City',
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
}) {
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [open, setOpen] = useState(false)
    const [highlight, setHighlight] = useState(-1)
    const ref = useRef<HTMLDivElement>(null)
    const inflight = useRef<AbortController | null>(null)

    // Debounced fetch as user types.
    useEffect(() => {
        const q = value.trim()
        if (q.length < 3) {
            setSuggestions([])
            return
        }
        const t = setTimeout(() => {
            inflight.current?.abort()
            const ctrl = new AbortController()
            inflight.current = ctrl
            fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`, {
                signal: ctrl.signal,
            })
                .then((r) => r.json())
                .then((data: { features: PhotonFeature[] }) => {
                    const out = (data.features || []).map(formatFeature).filter(Boolean) as string[]
                    setSuggestions(out)
                })
                .catch(() => {
                    // network or abort - silently ignore; the input still works without suggestions
                })
        }, 300)
        return () => clearTimeout(t)
    }, [value])

    useEffect(() => {
        if (!open) return
        function onClick(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    function pick(s: string) {
        onChange(s)
        setOpen(false)
        setSuggestions([])
    }

    function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open || suggestions.length === 0) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
        } else if (e.key === 'Enter' && highlight >= 0) {
            e.preventDefault()
            pick(suggestions[highlight])
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <input
                value={value}
                onChange={(e) => {
                    onChange(e.target.value)
                    setOpen(true)
                    setHighlight(-1)
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKey}
                placeholder={placeholder}
            />
            {open && suggestions.length > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 0.25em)',
                        left: 0,
                        right: 0,
                        zIndex: 20,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        boxShadow: 'var(--shadow-md)',
                        padding: '0.25em',
                    }}
                >
                    {suggestions.map((s, i) => (
                        <button
                            key={s + i}
                            type="button"
                            className="btn-bare"
                            onMouseDown={(e) => {
                                e.preventDefault()
                                pick(s)
                            }}
                            onMouseEnter={() => setHighlight(i)}
                            style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                background: i === highlight ? 'var(--surface-alt)' : 'transparent',
                                color: 'var(--text)',
                                borderRadius: 6,
                                padding: '0.5em 0.75em',
                                cursor: 'pointer',
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// formatFeature collapses a Photon feature into a one-line address. Skips
// fields that aren't useful for an event location (lakes, points of interest
// without addresses).
function formatFeature(f: PhotonFeature): string | null {
    const p = f.properties
    if (!p) return null
    const parts: string[] = []
    const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street ?? ''
    if (p.name && p.name !== street) parts.push(p.name)
    if (street) parts.push(street)
    if (p.city) parts.push(p.city)
    if (p.state && p.state !== p.city) parts.push(p.state)
    if (p.postcode) parts[parts.length - 1] = `${parts[parts.length - 1]} ${p.postcode}`
    if (p.country && p.country !== 'United States') parts.push(p.country)
    return parts.filter(Boolean).join(', ') || null
}
