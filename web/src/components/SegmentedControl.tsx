// SegmentedControl renders a tablist-style row of options with a sliding
// highlight. Used for status pickers ("attending / maybe / not attending")
// where a single selection needs to be obvious at a glance.
export function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T
    onChange: (v: T) => void
    options: Array<{ value: T; label: string; color?: string }>
}) {
    return (
        <div
            role="tablist"
            style={{
                display: 'inline-flex',
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: 3,
                gap: 2,
            }}
        >
            {options.map((opt) => {
                const selected = opt.value === value
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className="btn-bare"
                        onClick={() => onChange(opt.value)}
                        style={{
                            background: selected ? (opt.color ?? 'var(--accent)') : 'transparent',
                            color: selected ? 'white' : 'var(--text)',
                            borderRadius: 999,
                            padding: '0.4em 1em',
                            fontWeight: selected ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'background 0.15s, color 0.15s',
                        }}
                    >
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
}
