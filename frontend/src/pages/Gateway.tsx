import { InferencePlayground } from '../components/InferencePlayground'
import { SectionHeading } from '../components/SectionHeading'
import { KnowledgeBaseSummary } from '../lib/api'

interface GatewayPageProps {
  knowledgeBases: KnowledgeBaseSummary[]
  selectedKnowledgeBaseId: string | null
  onKnowledgeBaseChange: (id: string | null) => void
  onApiKeyChange: (key: string) => void
}

export default function Gateway({ knowledgeBases, selectedKnowledgeBaseId, onKnowledgeBaseChange, onApiKeyChange }: GatewayPageProps) {
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
        onKnowledgeBaseChange={onKnowledgeBaseChange}
        onApiKeyChange={onApiKeyChange}
      />
    </div>
  )
}