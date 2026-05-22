import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ManageList from './pages/ManageList'
import ManageEvent from './pages/ManageEvent'
import NewEventPage from './pages/NewEventPage'
import AuditPage from './pages/AuditPage'
import EventPage from './pages/EventPage'
import { useDocumentTitle } from './lib/title'
import './App.css'

// NotFound is the public-facing landing page. We intentionally don't link to
// /manage from here - the management surface stays unadvertised. Anyone who
// needs it knows the URL.
function NotFound() {
    useDocumentTitle('Not found')
    return (
        <div className="home">
            <h1>404</h1>
            <p className="muted" style={{ fontSize: '1.1rem' }}>
                Page not found.
            </p>
        </div>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/manage" element={<ManageList />} />
                <Route path="/manage/new" element={<NewEventPage />} />
                <Route path="/manage/audit" element={<AuditPage />} />
                <Route path="/manage/event/:slug" element={<ManageEvent />} />
                <Route path="/event/:slug" element={<EventPage />} />
                {/* Root + any unmatched route renders the 404 view. */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    )
}
