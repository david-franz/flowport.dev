import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, InferenceRequestBody, InferenceResponse, KnowledgeBaseSummary, Provider } from '../lib/api'
import { getKnowledgeBaseAttachments, listKnowledgeBases, runInference } from '../lib/api'

type SavedModel = {
  id: string
  label: string
  provider: Provider
  modelName: string
  apiKey: string
  parameters: string
  knowledgeBaseIds: string[]
  instructions: string
}

const PROVIDERS: { id: Provider; name: string; description: string; docUrl: string }[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Connect to GPT models via chat completions and ground answers with Flowknow retrieval.',
    docUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Access Google Gemini models using generateContent with optional grounded knowledge.',
    docUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  {
    id: 'llama',
    name: 'Llama API',
    description: 'Query hosted Llama models with JSON configurable parameters through Flowport.',
    docUrl: 'https://docs.llama-api.com',
  },
]

const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro-exp'],
  llama: ['llama-3.1-70b-instruct', 'llama-3.1-8b-instruct', 'llama-3-405b-instruct'],
}

const PROVIDER_KEY_PLACEHOLDERS: Record<Provider, string> = {
  openai: 'sk-...',
  gemini: 'AIzaSy...',
  llama: 'llama-...',
}

const DEFAULT_PARAMETERS: Record<Provider, string> = {
  openai: '{"temperature": 0.2}',
  gemini: '{"temperature": 0.4}',
  llama: '{"max_tokens": 512}',
}

const DEFAULT_TOP_K = 4
const CONTEXT_TEMPLATE_DEFAULT =
  'Use the following context to answer the question. If the context is empty, answer from general knowledge.\n\nContext:\n{context}\n\nUser prompt:\n{prompt}\n\nResponse:'

const SYSTEM_PROMPT_DEFAULT = 'You are Flowport, a helpful Flowtomic assistant. Answer clearly and reference retrieved knowledge when available.'
const MODELS_STORAGE_KEY = 'flowport:models'

const WELCOME_MESSAGES: Record<Provider, string> = {
  openai: 'Flowport is connected to OpenAI. Provide an API key, attach knowledge, and start the conversation.',
  gemini: 'Flowport is ready to reach Gemini. Configure your model, link Flowknow, and begin chatting.',
  llama: 'Flowport will relay prompts to the Llama API. Set parameters, attach knowledge, and ask away.',
}

const roleLabels: Record<ChatMessage['role'], string> = {
  assistant: 'Flowport',
  system: 'System',
  user: 'You',
}

const roleAccent: Record<ChatMessage['role'], string> = {
  assistant: 'bg-brand-500/10 border-brand-400 text-brand-900 dark:bg-brand-400/20 dark:border-brand-200/30 dark:text-white',
  user: 'bg-white border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-white/20 dark:text-white',
  system: 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-white/10 dark:border-white/10 dark:text-slate-200',
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normaliseProvider(value: unknown): Provider {
  return value === 'gemini' || value === 'llama' ? value : 'openai'
}

function loadStoredModels(): SavedModel[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MODELS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null
        const provider = normaliseProvider((item as Record<string, unknown>).provider)
        const modelNameRaw = (item as Record<string, unknown>).modelName
        const labelRaw = (item as Record<string, unknown>).label
        const apiKeyRaw = (item as Record<string, unknown>).apiKey
        const parametersRaw = (item as Record<string, unknown>).parameters
        const instructionsRaw = (item as Record<string, unknown>).instructions
        const knowledgeRaw = (item as Record<string, unknown>).knowledgeBaseIds
        const idRaw = (item as Record<string, unknown>).id

        const fallbackModel = MODEL_OPTIONS[provider][0]
        const label = typeof labelRaw === 'string' && labelRaw.trim().length > 0 ? labelRaw : `Model ${index + 1}`
        const knowledgeBaseIds = Array.isArray(knowledgeRaw)
          ? knowledgeRaw.filter((value): value is string => typeof value === 'string')
          : []

        return {
          id: typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : generateId(),
          label,
          provider,
          modelName:
            typeof modelNameRaw === 'string' && modelNameRaw.trim().length > 0 ? modelNameRaw.trim() : fallbackModel,
          apiKey: typeof apiKeyRaw === 'string' ? apiKeyRaw : '',
          parameters:
            typeof parametersRaw === 'string' && parametersRaw.trim().length > 0
              ? parametersRaw
              : DEFAULT_PARAMETERS[provider],
          knowledgeBaseIds,
          instructions:
            typeof instructionsRaw === 'string' && instructionsRaw.trim().length > 0
              ? instructionsRaw
              : SYSTEM_PROMPT_DEFAULT,
        }
      })
      .filter((value): value is SavedModel => value !== null)
  } catch (error) {
    console.warn('Unable to load stored models', error)
    return []
  }
}

function saveStoredModels(models: SavedModel[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(models))
  } catch (error) {
    console.warn('Unable to persist models', error)
  }
}

function createBlankModel(label: string): SavedModel {
  const provider: Provider = 'openai'
  return {
    id: generateId(),
    label,
    provider,
    modelName: MODEL_OPTIONS[provider][0],
    apiKey: '',
    parameters: DEFAULT_PARAMETERS[provider],
    knowledgeBaseIds: [],
    instructions: SYSTEM_PROMPT_DEFAULT,
  }
}

function extractAssistantText(response: InferenceResponse): string {
  if (response.output_text && response.output_text.trim().length > 0) {
    return response.output_text.trim()
  }
  const payload = response.payload
  if (typeof payload === 'string') {
    return payload
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload)) {
      const first = payload[0]
      if (first && typeof first === 'object' && 'generated_text' in first) {
        const generated = (first as Record<string, unknown>).generated_text
        if (typeof generated === 'string') return generated
      }
    }
    const maybeText = (payload as Record<string, unknown>).text
    if (typeof maybeText === 'string') return maybeText
  }
  try {
    return JSON.stringify(payload, null, 2)
  } catch (error) {
    console.warn('Unable to serialise payload', error)
    return '[No text returned]'
  }
}

function useLockedViewport() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const mainElement = document.querySelector('main') as HTMLElement | null
    const headerElement = document.querySelector('header') as HTMLElement | null
    const footerElement = document.querySelector('footer') as HTMLElement | null

    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousMainPadding = mainElement?.style.padding ?? ''
    const previousMainHeight = mainElement?.style.height ?? ''
    const previousMainOverflow = mainElement?.style.overflow ?? ''
    const previousMainDisplay = mainElement?.style.display ?? ''
    const previousMainFlexDirection = mainElement?.style.flexDirection ?? ''
    const previousMainAlignItems = mainElement?.style.alignItems ?? ''

    const applySizing = () => {
      if (!mainElement) return
      const headerHeight = headerElement?.offsetHeight ?? 0
      const footerHeight = footerElement?.offsetHeight ?? 0
      const height = window.innerHeight - headerHeight - footerHeight
      mainElement.style.padding = '0'
      mainElement.style.height = `${height}px`
      mainElement.style.overflow = 'hidden'
      mainElement.style.display = 'flex'
      mainElement.style.flexDirection = 'column'
      mainElement.style.alignItems = 'stretch'
    }

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    applySizing()
    window.addEventListener('resize', applySizing)

    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
      window.removeEventListener('resize', applySizing)
      if (mainElement) {
        mainElement.style.padding = previousMainPadding
        mainElement.style.height = previousMainHeight
        mainElement.style.overflow = previousMainOverflow
        mainElement.style.display = previousMainDisplay
        mainElement.style.flexDirection = previousMainFlexDirection
        mainElement.style.alignItems = previousMainAlignItems
      }
    }
  }, [])
}

function SidebarSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/80 shadow-sm transition dark:border-white/10 dark:bg-slate-950/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description && <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-300">{description}</p>}
        </div>
        <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 text-slate-500 transition dark:border-white/20 dark:text-slate-200">
          <svg className={`h-3 w-3 transition-transform ${open ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.585l3.71-3.354a.75.75 0 111.02 1.1l-4.229 3.827a.75.75 0 01-1.02 0L5.21 8.33a.75.75 0 01.02-1.12z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {open && <div className="border-t border-slate-200/60 px-4 py-4 text-sm dark:border-white/10">{children}</div>}
    </section>
  )
}

export default function Playground() {
  useLockedViewport()

  const initialModels = useMemo(() => {
    const stored = loadStoredModels()
    if (stored.length > 0) {
      return stored
    }
    return [createBlankModel('Model 1')]
  }, [])

  const [models, setModels] = useState<SavedModel[]>(initialModels)
  const [selectedModelId, setSelectedModelId] = useState<string>(initialModels[0]?.id ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: WELCOME_MESSAGES[initialModels[0]?.provider ?? 'openai'],
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])
  const [loadingKnowledge, setLoadingKnowledge] = useState<boolean>(true)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(false)
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(false)

  const conversationRef = useRef<HTMLDivElement | null>(null)

  const currentModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId]
  )

  useEffect(() => {
    saveStoredModels(models)
  }, [models])

  useEffect(() => {
    if (models.length === 0) {
      const fallback = createBlankModel('Model 1')
      setModels([fallback])
      setSelectedModelId(fallback.id)
      return
    }
    if (!selectedModelId || !models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(models[0].id)
    }
  }, [models, selectedModelId])

  useEffect(() => {
    let ignore = false

    async function fetchKnowledgeBases() {
      setLoadingKnowledge(true)
      setKnowledgeError(null)
      try {
        const data = await listKnowledgeBases()
        if (!ignore) {
          setKnowledgeBases(data)
        }
      } catch (err) {
        if (!ignore) {
          setKnowledgeError(err instanceof Error ? err.message : 'Unable to load knowledge bases')
        }
      } finally {
        if (!ignore) {
          setLoadingKnowledge(false)
        }
      }
    }

    fetchKnowledgeBases()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!currentModel) return
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[currentModel.provider] }])
    setInputValue('')
    setError(null)
  }, [currentModel?.id])

  useEffect(() => {
    if (!conversationRef.current) return
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight
  }, [messages, isSending])

  const currentProviderMeta = useMemo(
    () => PROVIDERS.find((item) => item.id === (currentModel?.provider ?? 'openai')) ?? PROVIDERS[0],
    [currentModel?.provider]
  )

  const attachedKnowledge = useMemo(() => {
    if (!currentModel) return [] as KnowledgeBaseSummary[]
    return knowledgeBases.filter((kb) => currentModel.knowledgeBaseIds.includes(kb.id))
  }, [currentModel, knowledgeBases])

  const handleCreateModel = () => {
    let created: SavedModel | null = null
    setModels((prev) => {
      const label = `Model ${prev.length + 1}`
      created = createBlankModel(label)
      return [...prev, created]
    })
    if (created) {
      setSelectedModelId(created.id)
    }
  }

  const handleDeleteModel = (id: string) => {
    setModels((prev) => prev.filter((model) => model.id !== id))
  }

  const updateSelectedModel = (patch: Partial<Omit<SavedModel, 'id'>>) => {
    if (!currentModel) return
    setModels((prev) =>
      prev.map((model) => (model.id === currentModel.id ? { ...model, ...patch } : model))
    )
  }

  const handleProviderChange = (next: Provider) => {
    const defaultModel = MODEL_OPTIONS[next][0]
    updateSelectedModel({ provider: next, modelName: defaultModel, parameters: DEFAULT_PARAMETERS[next] })
  }

  const handleKnowledgeToggle = (id: string) => {
    if (!currentModel) return
    const setIds = new Set(currentModel.knowledgeBaseIds)
    if (setIds.has(id)) {
      setIds.delete(id)
    } else {
      setIds.add(id)
    }
    updateSelectedModel({ knowledgeBaseIds: Array.from(setIds) })
  }

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isSending || !currentModel) return

    const trimmed = inputValue.trim()
    if (!trimmed) {
      setError('Enter a message to send to the model')
      return
    }

    const apiKey = currentModel.apiKey.trim()
    if (!apiKey) {
      setError(`Add your ${currentProviderMeta.name} API key to continue`)
      return
    }

    let parsedParameters: Record<string, unknown> | undefined
    const parametersText = currentModel.parameters.trim()
    if (parametersText) {
      try {
        parsedParameters = JSON.parse(parametersText)
      } catch (error) {
        setError(`Parameters must be valid JSON: ${(error as Error).message}`)
        return
      }
    }

    const attachedIds = currentModel.knowledgeBaseIds.filter((id) => knowledgeBases.some((kb) => kb.id === id))
    const attachmentCandidates = await getKnowledgeBaseAttachments(attachedIds)
    const knowledgeAttachments = attachmentCandidates
      .map((kb) => ({
        ...kb,
        documents: kb.documents.filter((document) => document.chunks.length > 0),
      }))
      .filter((kb) => kb.documents.length > 0)

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInputValue('')
    setIsSending(true)
    setError(null)

    const body: InferenceRequestBody = {
      provider: currentModel.provider,
      model: currentModel.modelName,
      messages: nextMessages,
      system_prompt: currentModel.instructions.trim() || undefined,
      parameters: parsedParameters,
      api_keys: { [currentModel.provider]: apiKey },
      api_key: apiKey,
    }

    if (knowledgeAttachments.length > 0) {
      body.knowledge_bases = knowledgeAttachments
      body.top_k = DEFAULT_TOP_K
      body.context_template = CONTEXT_TEMPLATE_DEFAULT
    }

    try {
      const response = await runInference(body)
      const assistantText = extractAssistantText(response)
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inference failed')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  const resetConversation = () => {
    if (!currentModel) return
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[currentModel.provider] }])
    setInputValue('')
    setError(null)
  }

  const knowledgeReady = knowledgeBases.some((kb) => kb.ready)

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100/70 text-slate-900 transition dark:bg-slate-950 dark:text-white">
      <aside
        className={`relative hidden h-full min-h-0 flex-none overflow-hidden border-r border-slate-200/60 bg-white/70 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-950/60 xl:flex xl:flex-col ${leftCollapsed ? 'w-16' : 'w-[22rem]'}`}
      >
        <button
          type="button"
          onClick={() => setLeftCollapsed((value) => !value)}
          className="absolute -right-3 top-6 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
          aria-label={leftCollapsed ? 'Expand models' : 'Collapse models'}
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${leftCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.293 15.707a1 1 0 010-1.414L14.586 12H5a1 1 0 110-2h9.586l-2.293-2.293a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {leftCollapsed ? (
          <div className="flex h-full flex-col items-center justify-between py-8 text-xs text-slate-500 dark:text-slate-300">
            <span className="rotate-90 whitespace-nowrap tracking-widest">Models</span>
            <span className="rotate-90 whitespace-nowrap tracking-widest">Flowport</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Playground</h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-300">
                Create reusable Flowport models with provider credentials and attached knowledge bases. Everything is stored locally in your browser.
              </p>
            </div>
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
              <SidebarSection
                title="Saved models"
                description="Select a model to edit its configuration or create a new one."
              >
                <div className="space-y-3 text-xs">
                  <button
                    type="button"
                    onClick={handleCreateModel}
                    className="w-full rounded-lg border border-dashed border-brand-400/60 bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-400/20 dark:border-brand-200/30 dark:text-brand-200"
                  >
                    + Create new model
                  </button>
                  {models.length === 0 && (
                    <p className="text-slate-500 dark:text-slate-300">No models yet. Create one to begin.</p>
                  )}
                  <ul className="space-y-2">
                    {models.map((model) => {
                      const selected = model.id === currentModel?.id
                      const providerMeta = PROVIDERS.find((item) => item.id === model.provider) ?? PROVIDERS[0]
                      return (
                        <li key={model.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedModelId(model.id)}
                            className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left text-xs shadow-sm transition ${
                              selected
                                ? 'border-brand-400 bg-brand-500/10 text-brand-800 dark:border-brand-200/40 dark:bg-brand-300/10 dark:text-brand-50'
                                : 'border-slate-200/60 bg-white/70 text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">{model.label}</p>
                              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                                {providerMeta.name} • {model.modelName}
                              </p>
                              {model.knowledgeBaseIds.length > 0 && (
                                <p className="mt-1 text-[10px] uppercase tracking-wide text-brand-600 dark:text-brand-200">
                                  {model.knowledgeBaseIds.length} knowledge source{model.knowledgeBaseIds.length === 1 ? '' : 's'}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteModel(model.id)
                              }}
                              className="rounded-lg border border-slate-200/60 px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-red-300 hover:text-red-500 dark:border-white/20 dark:text-slate-300"
                            >
                              Delete
                            </button>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </SidebarSection>
            </div>
          </div>
        )}
      </aside>

      <section className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-4 py-4">
        <header className="flex flex-col gap-2 rounded-3xl border border-slate-200/60 bg-white/80 px-6 py-4 shadow-sm dark:border-white/10 dark:bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Flowport Playground</h1>
              {currentModel ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  {currentProviderMeta.name} • {currentModel.modelName}
                  {attachedKnowledge.length > 0 && (
                    <span>
                      {' '}
                      • Knowledge:{' '}
                      {attachedKnowledge
                        .map((kb) => kb.name)
                        .join(', ')}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-300">Create a model to start chatting.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetConversation}
                className="rounded-lg border border-slate-200/60 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-brand-300 hover:text-brand-700 dark:border-white/20 dark:text-slate-200"
              >
                Reset conversation
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-950/60">
          <div ref={conversationRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
              {messages.map((message, index) => (
                <article
                  key={`${message.role}-${index}`}
                  className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm backdrop-blur ${roleAccent[message.role]}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-200">
                    {roleLabels[message.role]}
                  </span>
                  <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{message.content}</p>
                </article>
              ))}
              {isSending && (
                <article className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm backdrop-blur ${roleAccent.assistant}`}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-200">Flowport</span>
                  <p className="text-sm text-slate-500 dark:text-slate-200">Generating response…</p>
                </article>
              )}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-slate-200/60 bg-slate-50/80 px-6 py-3 dark:border-white/10 dark:bg-slate-900/60">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Compose message
              </label>
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                placeholder="Ask Flowport about your knowledge base, or iterate on model prompts…"
                className="w-full rounded-2xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-950 dark:text-white"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                {error ? <p className="text-xs text-red-500 dark:text-red-400">{error}</p> : <span className="text-xs text-slate-400 dark:text-slate-300">Shift + Enter for newline</span>}
                <button
                  type="submit"
                  disabled={isSending}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <aside
        className={`relative hidden h-full min-h-0 flex-none overflow-hidden border-l border-slate-200/60 bg-white/70 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-950/60 xl:flex xl:flex-col ${rightCollapsed ? 'w-16' : 'w-[22rem]'}`}
      >
        <button
          type="button"
          onClick={() => setRightCollapsed((value) => !value)}
          className="absolute -left-3 top-6 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
          aria-label={rightCollapsed ? 'Expand configuration' : 'Collapse configuration'}
        >
          <svg className={`h-3.5 w-3.5 transition-transform ${rightCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.707 4.293a1 1 0 010 1.414L5.414 8H15a1 1 0 110 2H5.414l2.293 2.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {rightCollapsed ? (
          <div className="flex h-full flex-col items-center justify-between py-8 text-xs text-slate-500 dark:text-slate-300">
            <span className="rotate-90 whitespace-nowrap tracking-widest">Config</span>
            <span className="rotate-90 whitespace-nowrap tracking-widest">Flowport</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Model configuration</h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-300">
                Provide credentials, pick a provider model, attach Flowknow knowledge bases, and add special instructions.
              </p>
            </div>
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
              <SidebarSection
                title="Provider & key"
                description="Choose where to route the model and store the API key locally."
              >
                {currentModel ? (
                  <div className="space-y-3 text-xs">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Provider
                      <select
                        value={currentModel.provider}
                        onChange={(event) => handleProviderChange(event.target.value as Provider)}
                        className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                      >
                        {PROVIDERS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      API key
                      <input
                        type="password"
                        value={currentModel.apiKey}
                        onChange={(event) => updateSelectedModel({ apiKey: event.target.value })}
                        placeholder={PROVIDER_KEY_PLACEHOLDERS[currentModel.provider]}
                        className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                      />
                      <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-500">Stored locally in your browser</span>
                    </label>
                    <a
                      href={currentProviderMeta.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-[11px] font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-200 dark:hover:text-brand-100"
                    >
                      Provider docs →
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-300">Create or select a model to edit these settings.</p>
                )}
              </SidebarSection>

              <SidebarSection
                title="Model details"
                description="Select a provider model from the list or type a custom identifier."
              >
                {currentModel ? (
                  <div className="space-y-3 text-xs">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Model identifier
                      <input
                        type="text"
                        list={`model-options-${currentModel.provider}`}
                        value={currentModel.modelName}
                        onChange={(event) => updateSelectedModel({ modelName: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                      />
                      <datalist id={`model-options-${currentModel.provider}`}>
                        {MODEL_OPTIONS[currentModel.provider].map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Parameters (JSON)
                      <textarea
                        value={currentModel.parameters}
                        onChange={(event) => updateSelectedModel({ parameters: event.target.value })}
                        rows={5}
                        className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-300">Select a model to view details.</p>
                )}
              </SidebarSection>

              <SidebarSection
                title="Knowledge attachments"
                description="Attach one or more Flowknow knowledge bases to this model."
              >
                {currentModel ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-400">
                      <span>{loadingKnowledge ? 'Loading…' : knowledgeReady ? 'Available' : 'Unavailable'}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          setLoadingKnowledge(true)
                          setKnowledgeError(null)
                          try {
                            const data = await listKnowledgeBases()
                            setKnowledgeBases(data)
                          } catch (err) {
                            setKnowledgeError(err instanceof Error ? err.message : 'Unable to load knowledge bases')
                          } finally {
                            setLoadingKnowledge(false)
                          }
                        }}
                        className="rounded-md border border-slate-200/60 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-brand-300 hover:text-brand-700 dark:border-white/20 dark:text-slate-300"
                      >
                        Refresh
                      </button>
                    </div>
                    {knowledgeError && <p className="text-xs text-red-500 dark:text-red-400">{knowledgeError}</p>}
                    {knowledgeBases.length === 0 && !loadingKnowledge && (
                      <p className="text-xs text-slate-500 dark:text-slate-300">No knowledge bases available. Create some in Flowknow first.</p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-400">
                      Knowledge attachments are optional — you can chat with the provider using only the system instructions.
                    </p>
                    <ul className="space-y-2">
                      {knowledgeBases.map((kb) => {
                        const checked = currentModel.knowledgeBaseIds.includes(kb.id)
                        return (
                          <li key={kb.id} className="rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2 text-xs dark:border-white/10 dark:bg-slate-900/60">
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleKnowledgeToggle(kb.id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400 dark:border-white/20 dark:bg-slate-900"
                              />
                              <span className="flex-1 text-left">
                                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{kb.name}</span>
                                {kb.description && (
                                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-300">{kb.description}</span>
                                )}
                                <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  {kb.document_count} docs · {kb.chunk_count} chunks {kb.ready ? '' : '• rebuilding'}
                                </span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                    {knowledgeBases.some((kb) => kb.id === 'flowport-starter') && (
                      <p className="text-[11px] text-slate-500 leading-relaxed dark:text-slate-300">
                        Tip: Attach the Flowport and Flowknow starter packs to test grounded conversations immediately.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-300">Select a model to attach knowledge bases.</p>
                )}
              </SidebarSection>

              <SidebarSection title="Special instructions" description="Set the system instructions that guide the model.">
                {currentModel ? (
                  <textarea
                    value={currentModel.instructions}
                    onChange={(event) => updateSelectedModel({ instructions: event.target.value })}
                    rows={5}
                    className="w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                  />
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-300">Choose a model to edit its instructions.</p>
                )}
              </SidebarSection>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
