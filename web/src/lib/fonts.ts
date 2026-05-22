// Curated Google Fonts. Order: sans-serif (clean) -> serif (warmer) -> display.
// Each label here is also the exact Google Fonts family name.
export const PRESET_FONTS: ReadonlyArray<string> = [
    'Inter',
    'Roboto',
    'Open Sans',
    'Montserrat',
    'Poppins',
    'Quicksand',
    'Atkinson Hyperlegible',
    'Lora',
    'Cormorant Garamond',
    'Crimson Pro',
    'Playfair Display',
    'Merriweather',
    'Roboto Slab',
    'Bebas Neue',
    'Dancing Script',
    'Pacifico',
    'Caveat',
    'Comfortaa',
] as const

// Inject a single Google Fonts <link> that loads every preset family. Called
// once on app boot so the font dropdown can render each option in its own
// face without a request burst.
let preloaded = false
export function preloadPresetFonts(): void {
    if (preloaded) return
    preloaded = true
    if (typeof document === 'undefined') return
    const families = PRESET_FONTS.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
    link.id = 'rsvp-preset-fonts'
    document.head.appendChild(link)
}

// Load a single font family on demand (used for custom user-supplied fonts).
const loaded = new Set<string>()
export function loadFont(family: string): void {
    if (!family || loaded.has(family)) return
    loaded.add(family)
    if (typeof document === 'undefined') return
    if (PRESET_FONTS.includes(family)) return // already covered by preload
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`
    document.head.appendChild(link)
}
