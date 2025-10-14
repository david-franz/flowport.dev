import { SectionHeading } from '../components/SectionHeading'

export default function Docs() {
  return (
    <div className="container-page px-4 flex flex-col gap-14">
      <SectionHeading
        eyebrow="Documentation"
        title="Flowport API overview"
        description="The Flowport backend exposes a concise REST surface for managing knowledge bases and forwarding inference calls to Hugging Face."
        align="left"
      />

      <article className="grid gap-12">
        <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-white">Authentication</h3>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            Flowport never stores your Hugging Face credentials. Include your <code className="rounded bg-white/10 px-1">hf_xxx</code> key in the
            request body for inference calls. For knowledge base uploads that need image captioning, supply the key within the accompanying form
            data so Flowport can call a captioning model on your behalf.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-white">Endpoints</h3>
          <ul className="mt-4 space-y-4 text-sm text-slate-300 leading-relaxed">
            <li>
              <code className="rounded bg-white/10 px-2 py-1 text-xs text-brand-100">GET /api/knowledge-bases</code> — list every knowledge base,
              including prebuilt Flowtomic packs that ship with the repository.
            </li>
            <li>
              <code className="rounded bg-white/10 px-2 py-1 text-xs text-brand-100">POST /api/knowledge-bases</code> — create a workspace. Follow
              with <code className="rounded bg-white/10 px-1">/ingest/text</code> or <code className="rounded bg-white/10 px-1">/ingest/file</code> calls.
            </li>
            <li>
              <code className="rounded bg-white/10 px-2 py-1 text-xs text-brand-100">POST /api/knowledge-bases/auto-build</code> — provide structured
              knowledge entries to generate a production-ready RAG database automatically.
            </li>
            <li>
              <code className="rounded bg-white/10 px-2 py-1 text-xs text-brand-100">POST /api/inference</code> — forward prompts to Hugging Face with
              optional RAG context. Include <code className="rounded bg-white/10 px-1">knowledge_base_id</code> and <code className="rounded bg-white/10 px-1">top_k</code> to blend retrieval with generation.
            </li>
          </ul>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 md:p-8">
          <h3 className="text-lg font-semibold text-white">Quick start</h3>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-300 leading-relaxed">
            <li>Create or select a knowledge base under the Knowledge tab.</li>
            <li>Upload PDFs, CSVs, images, or paste raw text to enrich the knowledge base.</li>
            <li>Head to the Gateway tab, enter your Hugging Face key, pick a model, and choose your knowledge base.</li>
            <li>Run inference and inspect the context Flowport injected before wiring the call into Flowgraph or Flowform.</li>
          </ol>
        </section>
      </article>
    </div>
  )
}