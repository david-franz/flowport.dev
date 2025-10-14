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
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

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
    <div className="container-page px-4 flex flex-col gap-10">
      <SectionHeading
        eyebrow="Inference gateway"
        title="Run any Hugging Face model with Flowport"
        description="Flowport wraps Hugging Face inference endpoints with Flowtomic guardrails, optional RAG context, and a friendly front-end to test calls before wiring them into production."
        align="left"
      />
      <div className="flex flex-col gap-6 xl:flex-row">
        <aside
          className={`relative rounded-3xl border border-slate-200/60 bg-white/80 p-4 transition-all duration-200 dark:border-white/10 dark:bg-slate-900/40 ${
            leftOpen ? 'xl:w-72' : 'xl:w-14'
          }`}
        >
          <button
            type="button"
            onClick={() => setLeftOpen((value) => !value)}
            className="absolute -right-3 top-4 hidden xl:inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/60 bg-white text-slate-600 shadow-sm hover:bg-slate-100 dark:border-white/20 dark:bg-slate-800 dark:text-slate-200"
            aria-label={leftOpen ? 'Collapse left panel' : 'Expand left panel'}
          >
            <svg className={`h-3 w-3 transition-transform ${leftOpen ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M12.293 15.707a1 1 0 010-1.414L14.586 12H5a1 1 0 110-2h9.586l-2.293-2.293a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className={`${leftOpen ? 'space-y-4' : 'hidden xl:block xl:h-full xl:w-full xl:opacity-0'}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Quick start</h3>
            <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li>1. Grab your Hugging Face API token.</li>
              <li>2. Choose a deployment-ready model to query.</li>
              <li>3. Attach a knowledge base produced in Flowknow.</li>
              <li>4. Inspect responses, context, and chunk matches.</li>
            </ol>
            <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
              Flowport automatically rebuilds RAG context every time Flowknow ingests new files. Re-run a prompt to pick up the latest changes.
            </div>
          </div>
        </aside>
        <div className="flex-1">
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
        <aside
          className={`relative rounded-3xl border border-slate-200/60 bg-white/80 p-4 transition-all duration-200 dark:border-white/10 dark:bg-slate-900/40 ${
            rightOpen ? 'xl:w-72' : 'xl:w-14'
          }`}
        >
          <button
            type="button"
            onClick={() => setRightOpen((value) => !value)}
            className="absolute -left-3 top-4 hidden xl:inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/60 bg-white text-slate-600 shadow-sm hover:bg-slate-100 dark:border-white/20 dark:bg-slate-800 dark:text-slate-200"
            aria-label={rightOpen ? 'Collapse right panel' : 'Expand right panel'}
          >
            <svg className={`h-3 w-3 transition-transform ${rightOpen ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M7.707 4.293a1 1 0 010 1.414L5.414 8H15a1 1 0 110 2H5.414l2.293 2.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div className={`${rightOpen ? 'space-y-4' : 'hidden xl:block xl:h-full xl:w-full xl:opacity-0'}`}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Helpful resources</h3>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li>
                <a className="text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200" href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">
                  Manage Hugging Face tokens
                </a>
              </li>
              <li>
                <a className="text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200" href="https://flowknow.dev" target="_blank" rel="noreferrer">
                  Curate context in Flowknow
                </a>
              </li>
              <li>
                <a className="text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200" href="https://flowtomic.ai" target="_blank" rel="noreferrer">
                  Flowtomic platform overview
                </a>
              </li>
            </ul>
            <div className="rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
              Need observability or rate limits? Flowport exposes telemetry hooks and throttling controls through the backend API.
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}