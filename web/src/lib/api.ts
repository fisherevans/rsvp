// Thin fetch wrapper. Throws ApiError on non-2xx; auto-attaches the event code header when set.

export class ApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, body: unknown, message: string) {
        super(message)
        this.status = status
        this.body = body
    }
}

type Opts = {
    method?: string
    body?: unknown
    code?: string
    asBlob?: boolean
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json'
    }
    if (opts.code) headers['X-Event-Code'] = opts.code

    const res = await fetch(path, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        credentials: 'include',
        body:
            opts.body === undefined
                ? undefined
                : opts.body instanceof FormData
                  ? opts.body
                  : JSON.stringify(opts.body),
    })

    if (opts.asBlob) {
        if (!res.ok) throw new ApiError(res.status, null, `${res.status} ${res.statusText}`)
        return (await res.blob()) as T
    }

    const ct = res.headers.get('content-type') ?? ''
    const data = ct.includes('application/json') ? await res.json() : await res.text()
    if (!res.ok) {
        const msg = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `${res.status} ${res.statusText}`
        throw new ApiError(res.status, data, msg)
    }
    return data as T
}
