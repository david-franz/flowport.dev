import { Link } from 'react-router-dom'
import { FeatureCard } from '../components/FeatureCard'
import { SectionHeading } from '../components/SectionHeading'

export default function Home() {
  const features = [
    {
      title: 'Universal model gateway',
      description:
        'Point Flowport at any Hugging Face model, from popular open-weight instruct models to private enterprise deployments. The gateway handles keys, throttling, and response normalisation so your app just calls one API.',
    },
    {
      title: 'RAG-ready handoff',
      description:
        'Flowknow curates the knowledge; Flowport injects it into generation. Reference Flowknow databases directly from the gateway to keep prompts grounded without rebuilding infrastructure.',
    },
    {
      title: 'Production readiness',
      description:
        'Flowport surfaces observability metadata, offers policy guardrails, and lets you blend different RAG sources for every call. It is the connective tissue between Flowtomic products and Hugging Face infrastructure.',
    },
  ]

  return (
    <div className="flex flex-col gap-24">
      <section className="container-page px-4">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-300/40 bg-brand-100/60 px-4 py-1 text-sm font-semibold uppercase text-brand-700 dark:border-brand-400/40 dark:bg-brand-400/10 dark:text-brand-200">
              Flowtomic • Flowport
            </span>
            <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 leading-tight dark:text-white">
              The Flowtomic gateway for Hugging Face models in production.
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed dark:text-slate-300">
              Flowport focuses on inference orchestration so you can compose production-ready experiences across Flowgraph, Flowform, and Flowlang in minutes. Connect any Hugging Face model, attach context prepared in Flowknow, and serve reliable responses at speed.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/playground"
                className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
              >
                Open the playground
              </Link>
              <a
                href="https://flowknow.dev"
                className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-200 dark:hover:text-brand-100"
                target="_blank"
                rel="noreferrer"
              >
                Visit Flowknow →
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-6 -left-6 h-24 w-24 rounded-full bg-brand-400/20 blur-3xl" aria-hidden />
            <div className="relative rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-soft dark:border-white/10 dark:bg-slate-900/60">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">One API, every model</h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed dark:text-slate-300">
                POST <code className="rounded bg-white/10 px-1">/inference</code> with your Hugging Face token to stream responses from any hosted
                model. Include <code className="rounded bg-white/10 px-1">knowledge_base_id</code> to enrich prompts with the latest RAG context managed in Flowknow.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-2xl border border-slate-200/60 bg-slate-100/80 p-4 text-xs text-slate-700 dark:border-white/10 dark:bg-slate-950/70 dark:text-brand-100">
{`curl https://your-flowport-url/api/inference \
  -H 'Authorization: Bearer hf_xxx' \
  -d '{
    "model": "mistralai/Mistral-7B-Instruct-v0.2",
    "prompt": "Summarise the Flowtomic platform",
    "knowledge_base_id": "flowport-starter"
  }'`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page px-4 flex flex-col items-center gap-12">
        <SectionHeading
          eyebrow="Why Flowport"
          title="Build adaptive experiences across the Flowtomic stack"
          description="Flowport is where inference, retrieval, and orchestration intersect. Roll it into Flowgraph pipelines, Flowform journeys, and language tooling without reimplementing the plumbing."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} title={feature.title} description={feature.description} />
          ))}
        </div>
      </section>

      <section className="container-page px-4 flex flex-col items-center gap-10">
        <SectionHeading
          eyebrow="Integrations"
          title="Designed for Flowgraph, Flowform, Flowlang, and beyond"
          description="Flowport speaks the same design language as the rest of the Flowtomic family. Use its gateway endpoints inside Flowgraph automations, Flowform experiences, or Flowlang programs to unify customer journeys."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Flowgraph ops',
              description: 'Trigger complex process flows that call Hugging Face models with contextual awareness pulled from Flowknow knowledge stores via Flowport.',
            },
            {
              title: 'Flowform experiences',
              description: 'Power dynamic forms that answer questions, guide users, and capture data with zero-shot and retrieval-assisted reasoning.',
            },
            {
              title: 'Flowlang programs',
              description: 'Compose intelligent agents that issue Flowport calls to reason over your organisation’s knowledge graph.',
            },
          ].map((integration) => (
            <FeatureCard key={integration.title} title={integration.title} description={integration.description} />
          ))}
        </div>
      </section>
    </div>
  )
}