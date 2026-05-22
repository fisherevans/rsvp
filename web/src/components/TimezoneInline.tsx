import { useState } from 'react'
import { TimezoneSelect } from './TimezoneSelect'

// TimezoneInline shows the current tz as small clickable text. Clicking
// reveals the full timezone dropdown inline. Used in the event date/time
// section so the tz is visible but not visually heavy.
export function TimezoneInline({
    value,
    onChange,
}: {
    value: string
    onChange: (tz: string) => void
}) {
    const [editing, setEditing] = useState(false)

    if (!editing) {
        return (
            <button
                type="button"
                className="btn-link btn-link-muted"
                onClick={() => setEditing(true)}
                title="Click to change timezone"
            >
                Times in {value}
            </button>
        )
    }

    return (
        <div className="row" style={{ gap: '0.5em' }}>
            <TimezoneSelect
                value={value}
                onChange={(tz) => {
                    onChange(tz)
                    setEditing(false)
                }}
            />
            <button type="button" className="secondary" onClick={() => setEditing(false)}>
                Done
            </button>
        </div>
    )
}
