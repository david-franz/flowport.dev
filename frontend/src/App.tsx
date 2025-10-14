import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import Home from './pages/Home'
import Gateway from './pages/Gateway'
import Knowledge from './pages/Knowledge'
import Docs from './pages/Docs'
import { KnowledgeBaseSummary } from './lib/api'

export default function App() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | null>(null)
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
              <Gateway
                knowledgeBases={knowledgeBases}
                selectedKnowledgeBaseId={selectedKnowledgeBaseId}
                onKnowledgeBaseChange={setSelectedKnowledgeBaseId}
                onApiKeyChange={(key) => setHfApiKey(key || null)}
              />
            }
          />
          <Route
            path="/knowledge"
            element={
              <Knowledge
                selectedKnowledgeBaseId={selectedKnowledgeBaseId}
                onSelectKnowledgeBase={setSelectedKnowledgeBaseId}
                onListChange={setKnowledgeBases}
                hfApiKey={hfApiKey}
              />
            }
          />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}