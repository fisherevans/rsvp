// Client-side markdown rendering for the management preview tab. The server
// also renders markdown (canonical, what guests see), but for live preview
// in the editor we render locally to avoid a round-trip per keystroke.
//
// DOMPurify keeps the output safe even if a host writes something exotic.
// Configured to allow basic formatting + images + links, mirroring the
// server's bluemonday UGC policy.

import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

export function renderMarkdownPreview(src: string): string {
    if (!src.trim()) return ''
    const raw = marked.parse(src, { async: false }) as string
    return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [
            'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'del', 's',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
            'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
        ALLOWED_URI_REGEXP: /^(https?:|\/|#|mailto:)/,
    })
}
