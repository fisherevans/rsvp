// Shared "redirect after login" helper. When a manage page gets a 401, it
// stashes the current path in sessionStorage and navigates to /manage so the
// login form prompts. ManageList's LoginForm reads the stash on success and
// navigates back. Lets a fresh browser hit a deep URL (/manage/event/foo)
// and end up there after typing the password.

const KEY = 'rsvp:redirect-after-login'

export function stashRedirect(path: string): void {
    try {
        sessionStorage.setItem(KEY, path)
    } catch {
        // sessionStorage unavailable (incognito quirks, etc.) - ignore.
    }
}

export function consumeRedirect(): string | null {
    try {
        const v = sessionStorage.getItem(KEY)
        if (v) sessionStorage.removeItem(KEY)
        return v
    } catch {
        return null
    }
}
