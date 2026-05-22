// SaveBar renders the standard save button + status messaging for a form
// section. Three visible states:
//
//   - dirty:    "<label>" enabled, clicking calls onSave
//   - busy:     "Saving..." disabled
//   - clean:    "Saved" disabled (or "✓ Saved" briefly after a save completes)
//
// Errors and the transient post-save confirmation render alongside the button.
//
// Lifecycle is managed by the parent: it owns dirty/busy/err/justSaved state
// and decides what onSave does. This component is just presentation so each
// form can wire its own save logic.
export function SaveBar({
    label,
    dirty,
    busy,
    justSaved,
    err,
    onSave,
}: {
    label: string
    dirty: boolean
    busy: boolean
    justSaved: boolean
    err?: string | null
    onSave: () => void
}) {
    return (
        <div className="row" style={{ alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}>
            <button onClick={onSave} disabled={!dirty || busy}>
                {busy ? 'Saving...' : dirty ? label : 'Saved'}
            </button>
            {justSaved && !busy && !dirty && (
                <span style={{ color: '#2e8b57', fontSize: '0.9em', fontWeight: 500 }}>
                    ✓ Saved
                </span>
            )}
            {err && <span style={{ color: 'var(--danger)', fontSize: '0.9em' }}>{err}</span>}
        </div>
    )
}
