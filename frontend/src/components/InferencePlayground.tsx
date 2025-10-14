import { FormEvent, useEffect, useMemo, useState } from 'react'
import { InferenceResponse, KnowledgeBaseSummary, runInference } from '../lib/api'

const HF_KEY_STORAGE = 'flowport:hf-api-key'

function getStoredKey(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(HF_KEY_STORAGE) ?? ''
}

interface InferencePlaygroundProps {
  knowledgeBases: KnowledgeBaseSummary[]
  selectedKnowledgeBaseId?: string | null
  onKnowledgeBaseChange?: (id: string | null) => void
  onApiKeyChange?: (key: string) => void
}

export function InferencePlayground({
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  onApiKeyChange,
}: InferencePlaygroundProps) {
  const [apiKey, setApiKey] = useState<string>(getStoredKey)
  const [model, setModel] = useState<string>('mistralai/Mistral-7B-Instruct-v0.2')
  const [prompt, setPrompt] = useState<string>('How does Flowport help teams deploy Hugging Face models?')
  const [systemPrompt, setSystemPrompt] = useState<string>('You are Flowport, a helpful Flowtomic assistant.')
  const [topK, setTopK] = useState<number>(4)
  const [parameters, setParameters] = useState<string>('')
  const [contextTemplate, setContextTemplate] = useState<string>(
    `Use the following context to answer the question.\n\nContext:\n{context}\n\nQ: {prompt}\nA:`
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<InferenceResponse | null>(null)

  const selectedId = useMemo(() => selectedKnowledgeBaseId ?? '', [selectedKnowledgeBaseId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (apiKey) {
      window.localStorage.setItem(HF_KEY_STORAGE, apiKey)
    } else {
      window.localStorage.removeItem(HF_KEY_STORAGE)
    }
  }, [apiKey])

  useEffect(() => {
    onApiKeyChange?.(apiKey)
  }, [apiKey, onApiKeyChange])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setResponse(null)
    if (!apiKey) {
      setError('Provide your Hugging Face API key to run inference')
      return
    }
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      setError('Enter a prompt')
      return
    }
    let parsedParameters: Record<string, unknown> | undefined
    if (parameters.trim()) {
      try {
        parsedParameters = JSON.parse(parameters)
      } catch (err) {
        setError(`Parameters must be valid JSON: ${(err as Error).message}`)
        return
      }
    }
    setLoading(true)
    try {
      const result = await runInference({
        hf_api_key: apiKey,
        model,
        prompt: trimmedPrompt,
        system_prompt: systemPrompt || undefined,
        knowledge_base_id: selectedId || undefined,
        top_k: topK,
        parameters: parsedParameters,
        context_template: contextTemplate || undefined,
      })
      setResponse(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectChange(event: FormEvent<HTMLSelectElement>) {
    const value = event.currentTarget.value
    onKnowledgeBaseChange?.(value || null)
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">Inference Gateway</h3>
          <p className="text-sm text-slate-300">
            Provide your Hugging Face credentials, choose a model, and optionally attach a knowledge base for RAG-augmented answers.
          </p>
        </div>
        <a
          href="https://huggingface.co/settings/tokens"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
        >
          Get a Hugging Face key
        </a>
      </header>

      <form className="mt-6 grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-300">Hugging Face API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="hf_xxxxx"
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              required
            />
            <p className="text-xs text-slate-400">Your key stays in your browser and is sent directly to the Flowport backend.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-300">Model name</label>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              placeholder="mistralai/Mistral-7B-Instruct-v0.2"
              required
            />
            <p className="text-xs text-slate-400">Any public or private Hugging Face model that your token can access.</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-300">System prompt</label>
            <input
              type="text"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              placeholder="Optional system instructions"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-300">Knowledge base</label>
            <select
              value={selectedId}
              onChange={handleSelectChange}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
            >
              <option value="">No knowledge base</option>
              {knowledgeBases.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name} {kb.source === 'prebuilt' ? '(prebuilt)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">Attach a knowledge base to inject relevant context before inference.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-300">Prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="h-32 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
            required
          />
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-300">Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value))}
              min={1}
              max={20}
              className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm text-slate-300">Context template</label>
            <textarea
              value={contextTemplate}
              onChange={(event) => setContextTemplate(event.target.value)}
              className="h-24 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
            />
            <p className="text-xs text-slate-400">Use `{'{context}'}` and `{'{prompt}'}` placeholders to craft the final message.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-300">Model parameters (JSON)</label>
          <textarea
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
            placeholder='{"max_new_tokens": 512}'
            className="h-24 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Running inference…' : 'Run inference'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      {response && (
        <div className="mt-8 grid gap-6">
          <div>
            <h4 className="text-lg font-semibold text-white">Model response</h4>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950/60 p-4 text-xs text-slate-200 border border-white/10">
              {JSON.stringify(response.payload, null, 2)}
            </pre>
          </div>
          {response.context && (
            <div>
              <h4 className="text-lg font-semibold text-white">Injected context</h4>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950/60 p-4 text-xs text-slate-200 border border-white/10">
                {response.context}
              </pre>
            </div>
          )}
          {response.knowledge_hits.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-white">Top knowledge matches</h4>
              <ul className="mt-3 space-y-4">
                {response.knowledge_hits.map((hit) => (
                  <li key={hit.chunk_id} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{hit.document_title ?? hit.document_id}</span>
                      <span>score {hit.score.toFixed(3)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-200 leading-relaxed">{hit.content}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}