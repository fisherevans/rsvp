export type ResponseStatus = 'invited' | 'maybe' | 'not_attending' | 'attending'

export type Event = {
    id: string
    slug: string
    name: string
    starts_at: string
    ends_at: string
    timezone: string
    details_md: string
    code: string
    locked: boolean
    theme_accent: string | null
    title_font: string | null
    text_font: string | null
    title_scale: number
    text_scale: number
    title_case: 'normal' | 'upper' | 'lower'
    theme_header_image: string | null
    poster_image: string | null
    summary: string | null
    address: string | null
    address_label: string | null
    all_day: boolean
    end_time_hidden: boolean
    end_condition: string | null
    created_at: string
    updated_at: string
    old_slugs: string[] | null
}

export type Attendee = {
    id: string
    event_id: string
    name: string
    created_at: string
}

export type RSVPResponse = {
    id: string
    event_id: string
    status: ResponseStatus
    status_note: string | null
    additional_guests: number
    attendee_ids: string[]
    created_at: string
    updated_at: string
}

export type EventDetails = Event & {
    details_html: string
    locked_effective: boolean
    attendees: Attendee[]
    responses: RSVPResponse[]
}
