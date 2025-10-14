import { useEffect, useMemo, useState } from 'react'
import {
  FlowFormDefinition,
  FlowFormFieldDefinition,
  FlowFormInstance,
  createFlowForm,
  reconcileFlowForm,
  updateFlowForm,
} from 'flowform'
import { FlowFormRenderer } from './FlowFormRenderer'
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
  initialApiKey?: string
  loadingKnowledge?: boolean
  knowledgeError?: string | null
}

function buildDefinition(knowledgeBases: KnowledgeBaseSummary[]): FlowFormDefinition {
  return {
    id: 'flowport-inference',
    sections: [
      {
        id: 'connection',
        title: 'Connection',
        description: 'Authenticate with Hugging Face and choose a model to run on Flowport.',
        fields: [
          {
            id: 'hf_api_key',
            label: 'Hugging Face API key',
            kind: 'password',
            required: true,
            placeholder: 'hf_xxxxx',
          },
          {
            id: 'model',
            label: 'Model name',
            kind: 'text',
            required: true,
            defaultValue: 'mistralai/Mistral-7B-Instruct-v0.2',
          },
        ],
      },
      {
        id: 'prompting',
        title: 'Prompting',
        description: 'Craft the instructions and prompt context for the model.',
        fields: [
          {
            id: 'system_prompt',
            label: 'System prompt',
            kind: 'text',
            placeholder: 'Optional system instructions',
            defaultValue: 'You are Flowport, a helpful Flowtomic assistant.',
          },
          {
            id: 'prompt',
            label: 'Prompt',
            kind: 'textarea',
            required: true,
            defaultValue: 'How does Flowport help teams deploy Hugging Face models?',
            rows: 6,
          },
        ],
      },
      {
        id: 'knowledge',
        title: 'Augment with knowledge (optional)',
        description: 'Attach a Flowknow knowledge base to inject relevant context prior to generation.',
        fields: [
          {
            id: 'knowledge_base_id',
            label: 'Knowledge base',
            kind: 'select',
            options: [{ value: '', label: 'No knowledge base' }, ...knowledgeBases.map((kb) => ({
              value: kb.id,
              label: `${kb.name}${kb.source === 'prebuilt' ? ' (prebuilt)' : ''}`,
            }))],
          },
          {
            id: 'top_k',
            label: 'Top K',
            kind: 'number',
            defaultValue: 4,
            min: 1,
            max: 20,
            step: 1,
            width: 'half',
          },
          {
            id: 'context_template',
            label: 'Context template',
            kind: 'textarea',
            rows: 4,
            defaultValue: `Use the following context to answer the question.\n\nContext:\n{context}\n\nQ: {prompt}\nA:`,
          },
        ],
      },
      {
        id: 'advanced',
        title: 'Parameters',
        fields: [
          {
            id: 'parameters',
            label: 'Model parameters (JSON)',
            kind: 'textarea',
            placeholder: '{"max_new_tokens": 512}',
            rows: 5,
          },
        ],
      },
    ],
  }
}

export function InferencePlayground({
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  onApiKeyChange,
  initialApiKey,
  loadingKnowledge,
  knowledgeError,
}: InferencePlaygroundProps) {
  const definition = useMemo(() => buildDefinition(knowledgeBases), [knowledgeBases])
  const [form, setForm] = useState<FlowFormInstance>(() =>
    createFlowForm(definition, {
      hf_api_key: initialApiKey ?? getStoredKey(),
      knowledge_base_id: selectedKnowledgeBaseId ?? '',
    })
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<InferenceResponse | null>(null)

  useEffect(() => {
    setForm((previous) =>
      reconcileFlowForm(previous, definition, {
        hf_api_key: previous.values.hf_api_key ?? initialApiKey ?? getStoredKey(),
        knowledge_base_id: selectedKnowledgeBaseId ?? previous.values.knowledge_base_id ?? '',
      })
    )
  }, [definition, selectedKnowledgeBaseId, initialApiKey])

  useEffect(() => {
    const key = String(form.values.hf_api_key ?? '')
    if (typeof window !== 'undefined') {
      if (key) {
        window.localStorage.setItem(HF_KEY_STORAGE, key)
      } else {
        window.localStorage.removeItem(HF_KEY_STORAGE)
      }
    }
    onApiKeyChange?.(key)
  }, [form.values.hf_api_key, onApiKeyChange])

  const selectedId = useMemo(() => String(form.values.knowledge_base_id ?? ''), [form.values.knowledge_base_id])

  async function handleSubmit() {
    setError(null)
    setResponse(null)
    const apiKey = String(form.values.hf_api_key ?? '')
    if (!apiKey) {
      setError('Provide your Hugging Face API key to run inference')
      return
    }
    const prompt = String(form.values.prompt ?? '')
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      setError('Enter a prompt')
      return
    }
    let parsedParameters: Record<string, unknown> | undefined
    const paramsRaw = String(form.values.parameters ?? '').trim()
    if (paramsRaw) {
      try {
        parsedParameters = JSON.parse(paramsRaw)
      } catch (err) {
        setError(`Parameters must be valid JSON: ${(err as Error).message}`)
        return
      }
    }
    setLoading(true)
    try {
      const result = await runInference({
        hf_api_key: apiKey,
        model: String(form.values.model ?? ''),
        prompt: trimmedPrompt,
        system_prompt: String(form.values.system_prompt ?? '') || undefined,
        knowledge_base_id: selectedId || undefined,
        top_k: Number(form.values.top_k ?? 4),
        parameters: parsedParameters,
        context_template: String(form.values.context_template ?? '') || undefined,
      })
      setResponse(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    onKnowledgeBaseChange?.(selectedId || null)
  }, [selectedId, onKnowledgeBaseChange])

  function handleFieldChange(fieldId: string, value: unknown) {
    setForm((prev) => updateFlowForm(prev, { [fieldId]: value }))
  }

  function renderDescription(field: FlowFormFieldDefinition) {
    if (field.id === 'hf_api_key') {
      return 'Your key stays in your browser and is sent directly to the Flowport backend.'
    }
    if (field.id === 'model') {
      return 'Any public or private Hugging Face model that your token can access.'
    }
    if (field.id === 'knowledge_base_id') {
      return knowledgeError
        ? knowledgeError
        : loadingKnowledge
          ? 'Loading knowledge bases…'
          : 'Attach a knowledge base managed in Flowknow to inject relevant context.'
    }
    if (field.id === 'context_template') {
      return "Use '{context}' and '{prompt}' placeholders to craft the final message."
    }
    return undefined
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

      <div className="mt-6 grid gap-6">
        <FlowFormRenderer form={form} onChange={handleFieldChange} renderFieldDescription={renderDescription} />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Running inference…' : 'Run inference'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

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