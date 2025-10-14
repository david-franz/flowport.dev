import { useEffect, useState } from 'react'
import { InferencePlayground } from '../components/InferencePlayground'
import { SectionHeading } from '../components/SectionHeading'
import { KnowledgeBaseSummary, listKnowledgeBases } from '../lib/api'

interface GatewayPageProps {
  onApiKeyChange: (key: string) => void
  initialApiKey?: string
}

export default function Gateway({ onApiKeyChange, initialApiKey }: GatewayPageProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await listKnowledgeBases()
        if (!ignore) {
          setKnowledgeBases(data)
          if (data.length > 0) {
            setSelectedKnowledgeBaseId((prev) => prev ?? data[0].id)
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Unable to load knowledge bases')
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="container-page px-4 flex flex-col gap-14">
      <SectionHeading
        eyebrow="Inference gateway"
        title="Run any Hugging Face model with Flowport"
        description="Flowport wraps Hugging Face inference endpoints with Flowtomic guardrails, optional RAG context, and a friendly front-end to test calls before wiring them into production."
        align="left"
      />
      <InferencePlayground
        knowledgeBases={knowledgeBases}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        onKnowledgeBaseChange={setSelectedKnowledgeBaseId}
        onApiKeyChange={onApiKeyChange}
        initialApiKey={initialApiKey}
        loadingKnowledge={loading}
        knowledgeError={error}
      />
    </div>
  )
}