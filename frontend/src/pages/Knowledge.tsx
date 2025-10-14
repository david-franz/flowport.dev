import { KnowledgeBaseExplorer } from '../components/KnowledgeBaseExplorer'
import { SectionHeading } from '../components/SectionHeading'
import { KnowledgeBaseSummary } from '../lib/api'

interface KnowledgePageProps {
  selectedKnowledgeBaseId: string | null
  onSelectKnowledgeBase: (id: string | null) => void
  onListChange: (knowledgeBases: KnowledgeBaseSummary[]) => void
  hfApiKey: string | null
}

export default function Knowledge({ selectedKnowledgeBaseId, onSelectKnowledgeBase, onListChange, hfApiKey }: KnowledgePageProps) {
  return (
    <div className="container-page px-4 flex flex-col gap-14">
      <SectionHeading
        eyebrow="Knowledge"
        title="Curate, upload, and generate Flowport knowledge bases"
        description="File uploads, transcript ingestion, and automatic knowledge packs roll into a unified retrieval layer. Flowport keeps everything chunked, vectorised, and ready to attach to inference requests."
        align="left"
      />
      <KnowledgeBaseExplorer
        selectedId={selectedKnowledgeBaseId}
        onSelect={onSelectKnowledgeBase}
        onListChange={onListChange}
        hfApiKey={hfApiKey}
      />
    </div>
  )
}