import { useEffect } from 'react'
import type { ReactNode } from 'react'

// Modal: simple overlay with a backdrop. Closes on Escape or backdrop click.
// Body scroll is locked while open.
export function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean
    onClose: () => void
    title?: string
    children: ReactNode
}) {
    useEffect(() => {
        if (!open) return
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [open, onClose])

    if (!open) return null

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
                padding: '1em',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius)',
                    maxWidth: 520,
                    width: '100%',
                    maxHeight: 'calc(100vh - 2em)',
                    overflow: 'auto',
                    padding: '1.5em',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.25)',
                }}
            >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75em' }}>
                    {title ? <h2 style={{ margin: 0 }}>{title}</h2> : <span />}
                    <button
                        type="button"
                        className="btn-bare"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            color: 'var(--muted)',
                            fontSize: '1.6em',
                            lineHeight: 1,
                            padding: '0 0.25em',
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}
