import { Route, Routes } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import Home from './pages/Home'
import Gateway from './pages/Gateway'
import Docs from './pages/Docs'
import { useState } from 'react'

export default function App() {
  const [hfApiKey, setHfApiKey] = useState<string | null>(null)

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <Header />
      <main className="flex-1 py-12 md:py-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/gateway"
            element={
              <Gateway onApiKeyChange={(key) => setHfApiKey(key || null)} initialApiKey={hfApiKey ?? undefined} />
            }
          />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}