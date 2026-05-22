import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { preloadPresetFonts } from './lib/fonts'

// One <link> fetches every preset Google Font we use, so the font dropdown
// can render each option in its own face without a request burst.
preloadPresetFonts()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
