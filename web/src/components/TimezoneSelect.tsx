import { useMemo } from 'react'

// Intl.supportedValuesOf isn't in older TS lib targets; declare narrowly.
type SupportedValuesOf = (key: 'timeZone') => string[]

export function TimezoneSelect({
    value,
    onChange,
}: {
    value: string
    onChange: (tz: string) => void
}) {
    const zones = useMemo(() => {
        const fn = (Intl as unknown as { supportedValuesOf?: SupportedValuesOf }).supportedValuesOf
        if (typeof fn === 'function') return fn('timeZone')
        // Fallback list if running on a browser without supportedValuesOf.
        return [
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Phoenix',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Australia/Sydney',
            'UTC',
        ]
    }, [])

    return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
            {zones.map((tz) => (
                <option key={tz} value={tz}>
                    {tz}
                </option>
            ))}
        </select>
    )
}

export function defaultTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
        return 'UTC'
    }
}
