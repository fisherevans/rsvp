import { useState } from 'react'
import { ColorPalette } from './ColorPalette'
import { Modal } from './Modal'

// ColorPaletteModal wraps the inline palette in a button + modal. The button
// shows the currently selected color as a swatch + the hex value. Click to
// pick from the palette or type a custom hex.
export function ColorPaletteModal({
    value,
    onChange,
}: {
    value: string
    onChange: (color: string) => void
}) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                type="button"
                className="secondary"
                onClick={() => setOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.6em',
                    padding: '0.5em 0.85em',
                    textTransform: 'none',
                    letterSpacing: 0,
                }}
            >
                <span
                    style={{
                        width: 24,
                        height: 24,
                        background: value,
                        border: '2px solid var(--ink)',
                        borderRadius: 4,
                        display: 'inline-block',
                        flex: '0 0 auto',
                    }}
                />
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600 }}>
                    {value.toUpperCase()}
                </span>
            </button>
            <Modal open={open} onClose={() => setOpen(false)} title="Accent color">
                <ColorPalette value={value} onChange={onChange} />
                <div className="row" style={{ marginTop: '1.5em', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setOpen(false)}>
                        Done
                    </button>
                </div>
            </Modal>
        </>
    )
}
