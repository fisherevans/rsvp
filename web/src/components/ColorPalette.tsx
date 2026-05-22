import { Check } from '@phosphor-icons/react'

// ColorPalette: structured accent picker. Grid of curated swatches + a hex
// input as the escape hatch. No native <input type="color"> dialog - the
// OS color pickers look out of place in a brutalist UI and let users pick
// fluorescent or low-contrast colors that ruin the event page.
//
// Picking a swatch updates the hex input. Typing into the hex input updates
// the selected swatch if it matches one in the palette.

// Curated palette grouped roughly by hue around the color wheel so the grid
// reads as a smooth gradient when you scan it. 24 entries - enough variety
// without feeling like a chooser dump.
const PALETTE: ReadonlyArray<{ hex: string; name: string }> = [
    // Warm
    { hex: '#e63946', name: 'Brand red' },
    { hex: '#dc2626', name: 'Bright red' },
    { hex: '#c2410c', name: 'Rust' },
    { hex: '#ea580c', name: 'Burnt orange' },
    { hex: '#f59e0b', name: 'Amber' },
    { hex: '#facc15', name: 'Sunshine' },
    // Green
    { hex: '#84cc16', name: 'Lime' },
    { hex: '#16a34a', name: 'Grass' },
    { hex: '#15803d', name: 'Forest' },
    { hex: '#047857', name: 'Pine' },
    { hex: '#0891b2', name: 'Teal' },
    { hex: '#0ea5e9', name: 'Sky' },
    // Blue / purple
    { hex: '#2563eb', name: 'Bright blue' },
    { hex: '#1e40af', name: 'Royal blue' },
    { hex: '#4338ca', name: 'Indigo' },
    { hex: '#7c3aed', name: 'Purple' },
    { hex: '#a855f7', name: 'Lavender' },
    { hex: '#db2777', name: 'Magenta' },
    // Pink / berry / neutrals
    { hex: '#ec4899', name: 'Hot pink' },
    { hex: '#be185d', name: 'Berry' },
    { hex: '#831843', name: 'Wine' },
    { hex: '#92400e', name: 'Cocoa' },
    { hex: '#57534e', name: 'Stone' },
    { hex: '#111111', name: 'Ink' },
] as const

export function ColorPalette({
    value,
    onChange,
}: {
    value: string
    onChange: (color: string) => void
}) {
    const normalized = value.trim().toLowerCase()
    const validHex = isValidHex(normalized) ? normalized : '#e63946'

    return (
        <div className="stack" style={{ gap: '0.85em' }}>
            <div
                style={{
                    display: 'grid',
                    // auto-fill picks as many columns as fit, so the grid
                    // expands across the modal on desktop and collapses to
                    // fewer columns on a narrow phone.
                    gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                    gap: '0.5em',
                }}
            >
                {PALETTE.map((c) => {
                    const selected = c.hex.toLowerCase() === normalized
                    return (
                        <button
                            key={c.hex}
                            type="button"
                            className="btn-bare"
                            onClick={() => onChange(c.hex)}
                            aria-label={c.name}
                            title={`${c.name} (${c.hex})`}
                            style={{
                                aspectRatio: '1 / 1',
                                background: c.hex,
                                border: '2px solid var(--ink)',
                                borderRadius: 'var(--radius)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: selected ? 'var(--shadow-sm)' : 'none',
                                transform: selected ? 'translate(-1px, -1px)' : 'none',
                                transition: 'transform 0.08s, box-shadow 0.08s',
                            }}
                        >
                            {selected && <Check size={20} weight="bold" color={contrastInk(c.hex)} />}
                        </button>
                    )
                })}
            </div>
            <div className="row" style={{ gap: '0.5em', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Hex
                </span>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="#RRGGBB"
                    spellCheck={false}
                    style={{
                        width: '7.5em',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        textTransform: 'uppercase',
                    }}
                    maxLength={7}
                />
                <span
                    style={{
                        width: 30,
                        height: 30,
                        background: validHex,
                        border: '2px solid var(--ink)',
                        borderRadius: 4,
                        flexShrink: 0,
                    }}
                    aria-hidden
                />
            </div>
        </div>
    )
}

function isValidHex(h: string): boolean {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)
}

// contrastInk picks black or white for foreground content placed on top of a
// background color, using a quick luminance approximation. Used for the
// checkmark sitting inside a selected swatch.
function contrastInk(hex: string): string {
    const h = hex.replace('#', '')
    const expand = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const r = parseInt(expand.slice(0, 2), 16)
    const g = parseInt(expand.slice(2, 4), 16)
    const b = parseInt(expand.slice(4, 6), 16)
    // sRGB luminance approximation: 0.299R + 0.587G + 0.114B
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.55 ? '#111111' : '#ffffff'
}
