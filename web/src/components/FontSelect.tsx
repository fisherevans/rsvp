import { useEffect, useRef, useState } from 'react'
import { PRESET_FONTS, loadFont } from '../lib/fonts'

// FontSelect is a custom dropdown (not <select>) so each option renders in
// its own actual font face. Native <option> styling for font-family is
// inconsistent across browsers; a popover lets us guarantee the preview.
//
// "Custom..." reveals a text input that takes an arbitrary Google Font family.
export function FontSelect({
    value,
    onChange,
    placeholder = '(system default)',
}: {
    value: string | null
    onChange: (font: string | null) => void
    placeholder?: string
}) {
    const isCustom = !!value && !PRESET_FONTS.includes(value)
    const [open, setOpen] = useState(false)
    const [customMode, setCustomMode] = useState(isCustom)
    const [customText, setCustomText] = useState(isCustom ? (value ?? '') : '')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onClick(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    useEffect(() => {
        if (value && !PRESET_FONTS.includes(value)) loadFont(value)
    }, [value])

    function selectPreset(font: string | null) {
        setCustomMode(false)
        onChange(font)
        setOpen(false)
    }

    function commitCustom(text: string) {
        const trimmed = text.trim()
        if (!trimmed) {
            onChange(null)
            return
        }
        loadFont(trimmed)
        onChange(trimmed)
    }

    const displayValue = value ?? placeholder
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="secondary"
                style={{
                    width: '100%',
                    textAlign: 'left',
                    fontFamily: value ? `"${value}", system-ui, sans-serif` : undefined,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6em 0.85em',
                    textTransform: 'none',
                }}
            >
                <span>{displayValue}</span>
                <span style={{ marginLeft: '0.5em', opacity: 0.5 }}>▾</span>
            </button>
            {open && (
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
                        maxHeight: 360,
                        overflowY: 'auto',
                        padding: '0.35em',
                    }}
                >
                    <FontRow label={placeholder} value={null} selected={value === null} onPick={() => selectPreset(null)} />
                    {PRESET_FONTS.map((f) => (
                        <FontRow
                            key={f}
                            label={f}
                            value={f}
                            selected={value === f}
                            onPick={() => selectPreset(f)}
                        />
                    ))}
                    <FontRow
                        label="Custom..."
                        value="__custom__"
                        selected={customMode}
                        onPick={() => {
                            setCustomMode(true)
                            setOpen(false)
                            commitCustom(customText)
                        }}
                    />
                </div>
            )}
            {customMode && (
                <input
                    placeholder="Google Font family name (e.g. Spectral)"
                    value={customText}
                    onChange={(e) => {
                        setCustomText(e.target.value)
                        commitCustom(e.target.value)
                    }}
                    style={{ marginTop: '0.5em', fontFamily: customText ? `"${customText.trim()}", system-ui` : undefined }}
                />
            )}
        </div>
    )
}

function FontRow({
    label,
    value,
    selected,
    onPick,
}: {
    label: string
    value: string | null
    selected: boolean
    onPick: () => void
}) {
    return (
        <button
            type="button"
            className="btn-bare"
            onClick={onPick}
            style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: selected ? 'var(--surface-alt)' : 'transparent',
                color: 'var(--text)',
                borderRadius: 6,
                padding: '0.55em 0.75em',
                fontFamily: value && value !== '__custom__' ? `"${value}", system-ui, sans-serif` : 'inherit',
                fontSize: '1rem',
                cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = 'var(--surface-alt)'
            }}
            onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = 'transparent'
            }}
        >
            {label}
        </button>
    )
}
