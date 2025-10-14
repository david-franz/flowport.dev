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
      title: 'Retrieval built-in',
      description:
        'Upload files, sync knowledge packs, or auto-build a database from raw content. Flowport keeps everything chunked, indexed, and ready to inject into prompts with a single flag.',
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
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-400/10 px-4 py-1 text-sm font-semibold uppercase text-brand-200">
              Flowtomic • Flowport
            </span>
            <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight">
              The Flowtomic gateway for Hugging Face models and retrieval augmented intelligence.
            </h1>
            <p className="text-lg text-slate-300 leading-relaxed">
              Flowport unifies inference and knowledge management so you can compose production-ready experiences across Flowgraph,
              Flowform, and Flowlang in minutes. Connect any Hugging Face model, attach the right context, and serve reliable responses at speed.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/gateway"
                className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
              >
                Try the gateway
              </Link>
              <Link to="/knowledge" className="text-sm font-medium text-brand-200 hover:text-brand-100">
                Explore knowledge tools →
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-6 -left-6 h-24 w-24 rounded-full bg-brand-400/20 blur-3xl" aria-hidden />
            <div className="relative rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-soft">
              <h3 className="text-lg font-semibold text-white">One API, every model</h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                POST <code className="rounded bg-white/10 px-1">/inference</code> with your Hugging Face token to stream responses from any hosted
                model. Include <code className="rounded bg-white/10 px-1">knowledge_base_id</code> to enrich prompts with the latest RAG context managed by Flowport.
              </p>
              <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950/70 p-4 text-xs text-brand-100 border border-white/10">
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
              description: 'Trigger complex process flows that call Hugging Face models with contextual awareness pulled from Flowport knowledge stores.',
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