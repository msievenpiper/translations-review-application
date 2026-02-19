import { type JSX, useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { AuditPage } from './pages/AuditPage'
import { HistoryPage } from './pages/HistoryPage'
import { HistoryDetailPage } from './pages/HistoryDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { OnboardingWizard } from './components/OnboardingWizard'

export function App(): JSX.Element {
  const [showOnboarding, setShowOnboarding] = useState(true)

  useEffect(() => {
    window.api.settings
      .load()
      .then((s) => {
        if (s?.apiKey) setShowOnboarding(false)
      })
      .catch(() => setShowOnboarding(false))
  }, [])

  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<AuditPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:auditId" element={<HistoryDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>

      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </>
  )
}

export default App
