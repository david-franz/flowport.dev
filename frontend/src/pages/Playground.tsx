import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage,
  InferenceRequestBody,
  InferenceResponse,
  KnowledgeBaseSummary,
  KnowledgeChunkMatch,
  Provider,
} from '../lib/api'
import { listKnowledgeBases, runInference } from '../lib/api'

type ProviderApiKeys = Partial<Record<Provider, string>>
type ProviderParameters = Record<Provider, string>
type ProviderModels = Record<Provider, string>

const PROVIDERS: { id: Provider; name: string; description: string; docUrl: string }[] = [
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Route to any Inference API hosted model. Ideal for open-weight instruct models and private deployments.',
    docUrl: 'https://huggingface.co/inference-api',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Tap into GPT models via chat completions with Flowport guardrails and RAG augmentation.',
    docUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Connect to Google Gemini models using generateContent, with optional system instructions and safety tuning.',
    docUrl: 'https://ai.google.dev/gemini-api/docs',
  },
  {
    id: 'llama',
    name: 'Llama API',
    description: 'Query Llama models through the hosted chat completions interface with JSON configurable parameters.',
    docUrl: 'https://docs.llama-api.com',
  },
]

const PROVIDER_DEFAULT_MODELS: ProviderModels = {
  huggingface: 'mistralai/Mistral-7B-Instruct-v0.2',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-pro',
  llama: 'llama-3.1-70b-instruct',
}

const PROVIDER_DEFAULT_PARAMETERS: ProviderParameters = {
  huggingface: '{"max_new_tokens": 512}',
  openai: '{"temperature": 0.2}',
  gemini: '{"temperature": 0.4}',
  llama: '{"max_tokens": 512}',
}

const PROVIDER_KEY_PLACEHOLDERS: Record<Provider, string> = {
  huggingface: 'hf_xxxxx',
  openai: 'sk-...',
  gemini: 'AIzaSy...',
  llama: 'llama-...',
}

const API_KEYS_STORAGE = 'flowport:provider-api-keys'
const WELCOME_MESSAGES: Record<Provider, string> = {
  huggingface: 'Flowport is ready to relay prompts to Hugging Face models. Configure your context and start chatting.',
  openai: 'You are connected to OpenAI through Flowport. Ask a question or provide instructions to begin.',
  gemini: 'Gemini access is configured through Flowport. Provide a prompt to generate a response with optional RAG.',
  llama: 'Route queries to the Llama API via Flowport. Set your model and context, then kick off the conversation.',
}

const SYSTEM_PROMPT_DEFAULT = 'You are Flowport, a helpful Flowtomic assistant. Answer clearly and reference retrieved knowledge when available.'
const CONTEXT_TEMPLATE_DEFAULT =
  'Use the following context to answer the question. If the context is empty, answer from general knowledge.\n\nContext:\n{context}\n\nUser prompt:\n{prompt}\n\nResponse:'

type InspectorTab = 'context' | 'knowledge' | 'raw'

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

function loadStoredApiKeys(): ProviderApiKeys {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const stored = window.localStorage.getItem(API_KEYS_STORAGE)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as ProviderApiKeys
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (error) {
    console.warn('Unable to parse stored API keys', error)
  }
  return {}
}

function saveApiKeys(keys: ProviderApiKeys) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(keys))
  } catch (error) {
    console.warn('Unable to persist API keys', error)
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

    const applySizing = () => {
      if (!mainElement) return
      const headerHeight = headerElement?.offsetHeight ?? 0
      const footerHeight = footerElement?.offsetHeight ?? 0
      const height = window.innerHeight - headerHeight - footerHeight
      mainElement.style.padding = '0'
      mainElement.style.height = `${height}px`
      mainElement.style.overflow = 'hidden'
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
      }
    }
  }, [])
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

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/60 p-4 text-sm shadow-sm dark:border-white/10 dark:bg-slate-950/40">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">{title}</h3>
      <div className="mt-3 text-sm text-slate-700 leading-relaxed dark:text-slate-200">{children}</div>
    </section>
  )
}

export default function Playground() {
  useLockedViewport()

  const [provider, setProvider] = useState<Provider>('huggingface')
  const [apiKeys, setApiKeys] = useState<ProviderApiKeys>(() => loadStoredApiKeys())
  const [models, setModels] = useState<ProviderModels>({ ...PROVIDER_DEFAULT_MODELS })
  const [parameters, setParameters] = useState<ProviderParameters>({ ...PROVIDER_DEFAULT_PARAMETERS })
  const [systemPrompt, setSystemPrompt] = useState<string>(SYSTEM_PROMPT_DEFAULT)
  const [contextTemplate, setContextTemplate] = useState<string>(CONTEXT_TEMPLATE_DEFAULT)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: WELCOME_MESSAGES.huggingface }])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])
  const [loadingKnowledge, setLoadingKnowledge] = useState<boolean>(true)
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null)
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | null>(null)
  const [topK, setTopK] = useState<number>(4)
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(false)
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('context')
  const [lastResponse, setLastResponse] = useState<InferenceResponse | null>(null)
  const [knowledgeHits, setKnowledgeHits] = useState<KnowledgeChunkMatch[]>([])
  const [contextText, setContextText] = useState<string | null>(null)

  const conversationRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    saveApiKeys(apiKeys)
  }, [apiKeys])

  useEffect(() => {
    let ignore = false

    async function fetchKnowledgeBases() {
      setLoadingKnowledge(true)
      setKnowledgeError(null)
      try {
        const data = await listKnowledgeBases()
        if (!ignore) {
          setKnowledgeBases(data)
          if (data.length > 0) {
            const preferred =
              data.find((kb) => kb.id === 'flowport-starter') ??
              data.find((kb) => kb.id === 'flowknow-starter') ??
              data[0]
            setSelectedKnowledgeBaseId((prev) => prev ?? preferred.id)
          }
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
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[provider] }])
    setLastResponse(null)
    setKnowledgeHits([])
    setContextText(null)
    setError(null)
  }, [provider])

  useEffect(() => {
    if (!conversationRef.current) return
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight
  }, [messages, isSending])

  const currentProviderMeta = useMemo(() => PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0], [provider])
  const currentModel = models[provider]
  const currentParameters = parameters[provider]

  const handleProviderSelect = (next: Provider) => {
    setProvider(next)
  }

  const handleModelChange = (id: Provider, value: string) => {
    setModels((prev) => ({ ...prev, [id]: value }))
  }

  const handleParametersChange = (id: Provider, value: string) => {
    setParameters((prev) => ({ ...prev, [id]: value }))
  }

  const handleApiKeyChange = (id: Provider, value: string) => {
    setApiKeys((prev) => ({ ...prev, [id]: value }))
  }

  const handleRefreshKnowledge = async () => {
    setLoadingKnowledge(true)
    setKnowledgeError(null)
    try {
      const data = await listKnowledgeBases()
      setKnowledgeBases(data)
      if (data.length > 0 && (!selectedKnowledgeBaseId || !data.some((kb) => kb.id === selectedKnowledgeBaseId))) {
        const preferred =
          data.find((kb) => kb.id === 'flowport-starter') ??
          data.find((kb) => kb.id === 'flowknow-starter') ??
          data[0]
        setSelectedKnowledgeBaseId(preferred.id)
      }
    } catch (err) {
      setKnowledgeError(err instanceof Error ? err.message : 'Unable to load knowledge bases')
    } finally {
      setLoadingKnowledge(false)
    }
  }

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isSending) return

    const trimmed = inputValue.trim()
    if (!trimmed) {
      setError('Enter a message to send to the model')
      return
    }

    const apiKey = (apiKeys[provider] ?? '').trim()
    if (!apiKey) {
      setError(`Add your ${currentProviderMeta.name} API key to continue`)
      return
    }

    let parsedParameters: Record<string, unknown> | undefined
    const parametersText = currentParameters.trim()
    if (parametersText) {
      try {
        parsedParameters = JSON.parse(parametersText)
      } catch (error) {
        setError(`Parameters must be valid JSON: ${(error as Error).message}`)
        return
      }
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInputValue('')
    setIsSending(true)
    setError(null)

    const body: InferenceRequestBody = {
      provider,
      model: currentModel,
      messages: nextMessages,
      system_prompt: systemPrompt.trim() || undefined,
      knowledge_base_id: selectedKnowledgeBaseId || undefined,
      top_k: topK || undefined,
      parameters: parsedParameters,
      context_template: contextTemplate.trim() || undefined,
      api_keys: apiKeys,
    }

    try {
      const response = await runInference(body)
      const assistantText = extractAssistantText(response)
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
      setLastResponse(response)
      setKnowledgeHits(response.knowledge_hits ?? [])
      setContextText(response.context ?? null)
      setInspectorTab(response.context ? 'context' : response.knowledge_hits.length ? 'knowledge' : 'raw')
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
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGES[provider] }])
    setInputValue('')
    setLastResponse(null)
    setKnowledgeHits([])
    setContextText(null)
    setError(null)
  }

  const knowledgeReady = useMemo(() => knowledgeBases.some((kb) => kb.ready), [knowledgeBases])

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100/70 text-slate-900 transition dark:bg-slate-950 dark:text-white">
      <aside
        className={`relative hidden h-full flex-none overflow-hidden border-r border-slate-200/60 bg-white/70 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-950/60 xl:flex xl:flex-col ${leftCollapsed ? 'w-16' : 'w-[22rem]'}`}
      >
        <button
          type="button"
          onClick={() => setLeftCollapsed((value) => !value)}
          className="absolute -right-3 top-6 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
          aria-label={leftCollapsed ? 'Expand settings' : 'Collapse settings'}
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
            <span className="rotate-90 whitespace-nowrap tracking-widest">Settings</span>
            <span className="rotate-90 whitespace-nowrap tracking-widest">Flowport</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Playground</h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-300">
                Configure providers, keys, prompting, and knowledge before generating responses. Settings apply to the current session.
              </p>
            </div>
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
              <SidebarSection
                title="Model providers"
                description="Pick a provider to drive inference, set its API key, and provide the model identifier the gateway should use."
              >
                <div className="space-y-3">
                  {PROVIDERS.map((item) => {
                    const active = provider === item.id
                    const keyValue = apiKeys[item.id] ?? ''
                    const modelValue = models[item.id] ?? ''
                    const parameterValue = parameters[item.id] ?? ''
                    return (
                      <article
                        key={item.id}
                        className={`rounded-2xl border px-4 py-4 text-xs transition dark:text-slate-200 ${
                          active
                            ? 'border-brand-400 bg-brand-500/10 shadow-sm dark:border-brand-200/40 dark:bg-brand-300/10'
                            : 'border-slate-200/70 bg-white/70 dark:border-white/10 dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</h3>
                            <p className="mt-1 text-[11px] text-slate-500 leading-relaxed dark:text-slate-300">{item.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleProviderSelect(item.id)}
                            className={`rounded-md border px-3 py-1 text-[11px] font-semibold transition ${
                              active
                                ? 'border-brand-400 bg-brand-400/20 text-brand-800 dark:border-brand-200/40 dark:bg-brand-300/20 dark:text-brand-50'
                                : 'border-slate-300/70 text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-white/20 dark:text-slate-200'
                            }`}
                          >
                            {active ? 'Selected' : 'Select'}
                          </button>
                        </div>
                        <div className="mt-3 space-y-3">
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            API key
                            <input
                              type="password"
                              value={keyValue}
                              onFocus={() => handleProviderSelect(item.id)}
                              onChange={(event) => handleApiKeyChange(item.id, event.target.value)}
                              placeholder={PROVIDER_KEY_PLACEHOLDERS[item.id]}
                              className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                            />
                            <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-500">Stored locally in your browser</span>
                          </label>
                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                            Model identifier
                            <input
                              type="text"
                              value={modelValue}
                              onFocus={() => handleProviderSelect(item.id)}
                              onChange={(event) => handleModelChange(item.id, event.target.value)}
                              placeholder={PROVIDER_DEFAULT_MODELS[item.id]}
                              className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                            />
                          </label>
                          {active && (
                            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                              Parameters (JSON)
                              <textarea
                                value={parameterValue}
                                onChange={(event) => handleParametersChange(item.id, event.target.value)}
                                rows={4}
                                className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                              />
                            </label>
                          )}
                        </div>
                        <a
                          href={item.docUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-brand-600 hover:text-brand-500 dark:text-brand-200 dark:hover:text-brand-100"
                        >
                          Provider docs →
                        </a>
                      </article>
                    )
                  })}
                </div>
              </SidebarSection>

              <SidebarSection title="Prompt orchestration" description="Adjust system instructions, templates, and retrieval preferences.">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-300">
                  System prompt
                  <textarea
                    value={systemPrompt}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                  />
                </label>
                <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-300">
                  Context template
                  <textarea
                    value={contextTemplate}
                    onChange={(event) => setContextTemplate(event.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                  />
                </label>
                <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-300">
                  RAG Top K
                  <input
                    type="number"
                    value={topK}
                    min={1}
                    max={20}
                    onChange={(event) => setTopK(Number(event.target.value) || 1)}
                    className="mt-1 w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-white/10 dark:bg-slate-900/80 dark:text-white"
                  />
                </label>
              </SidebarSection>

              <SidebarSection title="Knowledge" description="Attach Flowknow databases to ground responses with retrieval results.">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
                  <span>{loadingKnowledge ? 'Loading knowledge bases…' : knowledgeReady ? 'Select a knowledge base' : 'No knowledge bases yet'}</span>
                  <button
                    type="button"
                    onClick={handleRefreshKnowledge}
                    className="rounded-md border border-slate-200/60 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-brand-300 hover:text-brand-700 dark:border-white/20 dark:text-slate-300"
                  >
                    Refresh
                  </button>
                </div>
                {knowledgeError && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{knowledgeError}</p>}
                {knowledgeBases.some((kb) => kb.id === 'flowport-starter') && (
                  <p className="mt-3 text-[11px] text-slate-500 leading-relaxed dark:text-slate-300">
                    Tip: The Flowport Starter Pack combines Flowport and Flowknow highlights so you can attach it to any
                    model and immediately demonstrate retrieval-augmented answers.
                  </p>
                )}
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setSelectedKnowledgeBaseId(null)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selectedKnowledgeBaseId === null
                        ? 'border-brand-400 bg-brand-500/10 text-brand-800 dark:border-brand-200/40 dark:bg-brand-300/10 dark:text-brand-50'
                        : 'border-slate-200/60 bg-white/70 text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200'
                    }`}
                  >
                    No knowledge base
                  </button>
                  {knowledgeBases.map((kb) => (
                    <button
                      key={kb.id}
                      type="button"
                      onClick={() => setSelectedKnowledgeBaseId(kb.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                        selectedKnowledgeBaseId === kb.id
                          ? 'border-brand-400 bg-brand-500/10 text-brand-800 dark:border-brand-200/40 dark:bg-brand-300/10 dark:text-brand-50'
                          : 'border-slate-200/60 bg-white/70 text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200'
                      }`}
                    >
                      <span className="font-semibold text-slate-700 dark:text-white">{kb.name}</span>
                      {kb.description && <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-300">{kb.description}</span>}
                      <span className="mt-1 block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {kb.document_count} docs · {kb.chunk_count} chunks {kb.ready ? '' : '• rebuilding'}
                      </span>
                    </button>
                  ))}
                </div>
              </SidebarSection>
            </div>
          </div>
        )}
      </aside>

      <section className="flex flex-1 min-h-0 flex-col overflow-hidden px-4 py-6">
        <header className="flex flex-col gap-2 rounded-3xl border border-slate-200/60 bg-white/80 px-6 py-4 shadow-sm dark:border-white/10 dark:bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Flowport Playground</h1>
              <p className="text-sm text-slate-500 dark:text-slate-300">
                {currentProviderMeta.name} • {currentModel}
                {selectedKnowledgeBaseId ? ` • Knowledge: ${knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId)?.name ?? 'Selected'}` : ''}
              </p>
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

        <div className="mt-4 flex flex-1 min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-950/60">
          <div ref={conversationRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
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
          <form onSubmit={handleSubmit} className="border-t border-slate-200/60 bg-slate-50/80 px-6 py-4 dark:border-white/10 dark:bg-slate-900/60">
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
        className={`relative hidden h-full flex-none overflow-hidden border-l border-slate-200/60 bg-white/70 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-950/60 xl:flex xl:flex-col ${rightCollapsed ? 'w-16' : 'w-[22rem]'}`}
      >
        <button
          type="button"
          onClick={() => setRightCollapsed((value) => !value)}
          className="absolute -left-3 top-6 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300/80 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
          aria-label={rightCollapsed ? 'Expand inspector' : 'Collapse inspector'}
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
            <span className="rotate-90 whitespace-nowrap tracking-widest">Insights</span>
            <span className="rotate-90 whitespace-nowrap tracking-widest">Flowport</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Inspector</h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed dark:text-slate-300">
                Review retrieved context, top matches, and raw responses for the latest generation.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-white/70 p-1 text-xs font-semibold text-slate-600 shadow-sm dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-200">
              <button
                type="button"
                onClick={() => setInspectorTab('context')}
                className={`flex-1 rounded-2xl px-3 py-1 transition ${
                  inspectorTab === 'context'
                    ? 'bg-brand-500/20 text-brand-700 dark:bg-brand-300/20 dark:text-brand-50'
                    : 'hover:text-brand-700 dark:hover:text-brand-200'
                }`}
              >
                Context
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('knowledge')}
                className={`flex-1 rounded-2xl px-3 py-1 transition ${
                  inspectorTab === 'knowledge'
                    ? 'bg-brand-500/20 text-brand-700 dark:bg-brand-300/20 dark:text-brand-50'
                    : 'hover:text-brand-700 dark:hover:text-brand-200'
                }`}
              >
                Knowledge
              </button>
              <button
                type="button"
                onClick={() => setInspectorTab('raw')}
                className={`flex-1 rounded-2xl px-3 py-1 transition ${
                  inspectorTab === 'raw'
                    ? 'bg-brand-500/20 text-brand-700 dark:bg-brand-300/20 dark:text-brand-50'
                    : 'hover:text-brand-700 dark:hover:text-brand-200'
                }`}
              >
                Raw
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {inspectorTab === 'context' && (
                <InspectorSection title="Injected context">
                  {contextText ? (
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200/60 bg-white/80 p-3 text-xs leading-relaxed text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
                      {contextText}
                    </pre>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-300">No context was injected for the last response.</p>
                  )}
                </InspectorSection>
              )}

              {inspectorTab === 'knowledge' && (
                <InspectorSection title="Top matches">
                  {knowledgeHits.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-300">No matching chunks were returned.</p>
                  ) : (
                    <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-200">
                      {knowledgeHits.map((hit) => (
                        <li key={hit.chunk_id} className="rounded-xl border border-slate-200/60 bg-white/80 p-3 dark:border-white/10 dark:bg-slate-900/40">
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-400">
                            <span>{hit.document_title ?? hit.document_id}</span>
                            <span>score {hit.score.toFixed(3)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-200">{hit.content}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </InspectorSection>
              )}

              {inspectorTab === 'raw' && (
                <InspectorSection title="Raw response">
                  {lastResponse ? (
                    <pre className="max-h-60 overflow-auto whitespace-pre text-xs text-slate-700 dark:text-slate-100">
                      {JSON.stringify(lastResponse.payload, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-300">Send a message to view raw payloads.</p>
                  )}
                </InspectorSection>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
