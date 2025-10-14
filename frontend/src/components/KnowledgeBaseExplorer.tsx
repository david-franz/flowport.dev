import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  KnowledgeBaseSummary,
  createKnowledgeBase,
  ingestFile,
  ingestText,
  listKnowledgeBases,
  autoBuildKnowledgeBase,
} from '../lib/api'

interface KnowledgeBaseExplorerProps {
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  hfApiKey?: string | null
  onListChange?: (knowledgeBases: KnowledgeBaseSummary[]) => void
}

export function KnowledgeBaseExplorer({ selectedId, onSelect, hfApiKey, onListChange }: KnowledgeBaseExplorerProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(selectedId ?? null)
  const [creating, setCreating] = useState(false)
  const [creatingMessage, setCreatingMessage] = useState<string | null>(null)
  const [ingestMessage, setIngestMessage] = useState<string | null>(null)
  const [autoBuildMessage, setAutoBuildMessage] = useState<string | null>(null)
  const [autoBuilding, setAutoBuilding] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (selectedId) {
      setActiveId(selectedId)
    }
  }, [selectedId])

  const active = useMemo(
    () => knowledgeBases.find((kb) => kb.id === activeId) ?? null,
    [knowledgeBases, activeId]
  )

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await listKnowledgeBases()
      setKnowledgeBases(data)
      onListChange?.(data)
      if (!activeId && data.length > 0) {
        const firstId = data[0].id
        setActiveId(firstId)
        onSelect?.(firstId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load knowledge bases')
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(id: string) {
    setActiveId(id)
    onSelect?.(id)
    setIngestMessage(null)
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const description = String(form.get('description') ?? '').trim() || undefined
    if (!name) {
      setCreatingMessage('Name is required')
      return
    }
    setCreating(true)
    setCreatingMessage(null)
    try {
      const created = await createKnowledgeBase({ name, description })
      setCreatingMessage('Knowledge base created successfully')
      await refresh()
      setActiveId(created.id)
      onSelect?.(created.id)
      event.currentTarget.reset()
    } catch (err) {
      setCreatingMessage(err instanceof Error ? err.message : 'Creation failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleTextIngest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeId) {
      setIngestMessage('Select a knowledge base first')
      return
    }
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim() || 'Untitled'
    const content = String(form.get('content') ?? '').trim()
    const chunkSize = Number(String(form.get('chunk_size') ?? '750')) || 750
    const chunkOverlap = Number(String(form.get('chunk_overlap') ?? '50')) || 50
    if (!content) {
      setIngestMessage('Content is required')
      return
    }
    setIngestMessage('Processing text...')
    try {
      await ingestText(activeId, { title, content, chunk_size: chunkSize, chunk_overlap: chunkOverlap })
      setIngestMessage('Text ingested successfully')
      event.currentTarget.reset()
      await refresh()
    } catch (err) {
      setIngestMessage(err instanceof Error ? err.message : 'Failed to ingest text')
    }
  }

  async function handleFileChange(event: FormEvent<HTMLInputElement>) {
    if (!activeId) {
      setIngestMessage('Select a knowledge base first')
      return
    }
    const files = event.currentTarget.files
    if (!files || files.length === 0) {
      return
    }
    const file = files[0]
    setIngestMessage(`Uploading ${file.name}...`)
    try {
      await ingestFile(activeId, file, { hf_api_key: hfApiKey ?? undefined })
      setIngestMessage(`${file.name} ingested successfully`)
      event.currentTarget.value = ''
      await refresh()
    } catch (err) {
      setIngestMessage(err instanceof Error ? err.message : 'File upload failed')
    }
  }

  async function handleAutoBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('auto_name') ?? '').trim()
    const description = String(form.get('auto_description') ?? '').trim() || undefined
    const rawEntries = String(form.get('auto_entries') ?? '').trim()
    if (!name || !rawEntries) {
      setAutoBuildMessage('Provide a name and knowledge entries')
      return
    }
    const blocks = rawEntries.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    const knowledgeItems = blocks.map((block) => {
      const [first, ...rest] = block.split('\n')
      const title = first?.trim() || 'Knowledge Item'
      const content = rest.join('\n').trim() || first.trim()
      return { title, content }
    })
    if (knowledgeItems.length === 0) {
      setAutoBuildMessage('Unable to parse knowledge entries')
      return
    }
    setAutoBuilding(true)
    setAutoBuildMessage('Assembling knowledge base...')
    try {
      const created = await autoBuildKnowledgeBase({
        name,
        description,
        knowledge_items: knowledgeItems,
      })
      setAutoBuildMessage('Knowledge base generated successfully')
      (event.currentTarget as HTMLFormElement).reset()
      await refresh()
      setActiveId(created.id)
      onSelect?.(created.id)
    } catch (err) {
      setAutoBuildMessage(err instanceof Error ? err.message : 'Auto-build failed')
    } finally {
      setAutoBuilding(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="bg-slate-900/40 border border-white/10 rounded-3xl p-6 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white">Knowledge Bases</h3>
            <p className="text-sm text-slate-300">Select an existing base or create a new one to attach context to your models.</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            Refresh
          </button>
        </header>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {loading && <div className="col-span-full text-sm text-slate-400">Loading knowledge bases…</div>}
          {error && <div className="col-span-full text-sm text-red-400">{error}</div>}
          {!loading && knowledgeBases.length === 0 && !error && (
            <div className="col-span-full text-sm text-slate-400">No knowledge bases yet — create one using the form below.</div>
          )}
          {knowledgeBases.map((kb) => (
            <article
              key={kb.id}
              className={`rounded-2xl border p-5 transition ${
                active?.id === kb.id ? 'border-brand-400 bg-brand-400/10 shadow-lg' : 'border-white/10 bg-slate-950/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-semibold text-white">{kb.name}</h4>
                  {kb.description && <p className="text-sm text-slate-300 mt-1">{kb.description}</p>}
                  <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">
                    {kb.source === 'prebuilt' ? 'Prebuilt' : 'User'} • {kb.document_count} docs • {kb.chunk_count} chunks
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelect(kb.id)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${
                    active?.id === kb.id ? 'border-brand-400 text-brand-100 bg-brand-500/20' : 'border-white/10 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  {active?.id === kb.id ? 'Selected' : 'Select'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-white">Create a Knowledge Base</h3>
          <p className="mt-2 text-sm text-slate-300">Define a new workspace that you can enrich with text, files, or auto-generated data.</p>
          <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreate}>
            <div>
              <label className="text-sm text-slate-300">Name</label>
              <input
                type="text"
                name="name"
                placeholder="Flowport launch brief"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Description</label>
              <textarea
                name="description"
                placeholder="What topics should this knowledge base cover?"
                className="mt-1 h-24 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create knowledge base'}
            </button>
            {creatingMessage && <p className="text-xs text-slate-300">{creatingMessage}</p>}
          </form>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-white">Auto-build from Knowledge Entries</h3>
          <p className="mt-2 text-sm text-slate-300">
            Paste structured content blocks separated by blank lines. The first line of each block becomes the title, and the rest is
            treated as the knowledge body.
          </p>
          <form className="mt-5 flex flex-col gap-4" onSubmit={handleAutoBuild}>
            <div>
              <label className="text-sm text-slate-300">Name</label>
              <input
                type="text"
                name="auto_name"
                placeholder="Support knowledge pack"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Description</label>
              <input
                type="text"
                name="auto_description"
                placeholder="Optional description"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Knowledge entries</label>
              <textarea
                name="auto_entries"
                placeholder={`Flowport onboarding\nOur platform coordinates secure inference requests to Hugging Face models...\n\nPlaybook\nFocus on API keys, rate limits, and knowledge coverage.`}
                className="mt-1 h-40 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={autoBuilding}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autoBuilding ? 'Building…' : 'Generate knowledge base'}
            </button>
            {autoBuildMessage && <p className="text-xs text-slate-300">{autoBuildMessage}</p>}
          </form>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
        <h3 className="text-lg font-semibold text-white">Enrich Selected Knowledge Base</h3>
        {active ? (
          <p className="mt-2 text-sm text-slate-300">
            Currently managing <span className="text-brand-300 font-medium">{active.name}</span>. Upload files or paste raw content to feed
            retrieval.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-300">Select a knowledge base above to begin enrichment.</p>
        )}
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <form className="flex flex-col gap-3" onSubmit={handleTextIngest}>
            <div>
              <label className="text-sm text-slate-300">Title</label>
              <input
                type="text"
                name="title"
                placeholder="Flowtomic architecture"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-slate-300">Content</label>
              <textarea
                name="content"
                placeholder="Paste relevant text, transcripts, or notes here..."
                className="mt-1 h-40 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Chunk size</label>
                <input
                  type="number"
                  name="chunk_size"
                  defaultValue={750}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Overlap</label>
                <input
                  type="number"
                  name="chunk_overlap"
                  defaultValue={50}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add text
            </button>
          </form>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-slate-300">Upload a file</label>
              <input
                type="file"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-brand-400"
                accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg"
              />
              <p className="mt-2 text-xs text-slate-400">
                Supports TXT, CSV, PDF, PNG, and JPEG. Provide your Hugging Face key in the playground to unlock automatic image captions.
              </p>
            </div>
            {ingestMessage && <p className="text-xs text-slate-300">{ingestMessage}</p>}
          </div>
        </div>
      </section>
    </div>
  )
}