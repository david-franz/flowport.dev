import { SectionHeading } from '../components/SectionHeading'

export default function Workbench() {
  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Knowledge workbench"
        title="Manage context in Flowknow"
        description="Use Flowknow.dev to curate files, transcripts, and structured briefs into ready-to-query knowledge bases. Flowport connects to those packs instantly."
        align="left"
      />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 md:p-8 flex flex-col gap-4 dark:border-white/10 dark:bg-slate-900/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">What lives in Flowknow?</h3>
          <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
            Flowknow ingests files (TXT, CSV, PDF, PNG, JPEG), free-form notes, and structured knowledge entries. It chunks, vectors, and indexes
            everything so Flowport can request fresh context with a single <code className="rounded bg-white/10 px-1">knowledge_base_id</code>.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
            Every update automatically rebuilds the retrieval index, keeping your production workloads grounded in the latest institutional knowledge.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200/60 bg-white/80 p-6 md:p-8 flex flex-col gap-4 dark:border-white/10 dark:bg-slate-900/40">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Launch Flowknow</h3>
          <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
            The Flowknow workbench shares the same design language and Flowform-powered playground as Flowport. Spin up knowledge packs, monitor
            documents, and connect them straight back to this gateway.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://flowknow.dev"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
            >
              Open Flowknow.dev
            </a>
            <a
              href="https://flowtomic.ai"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-200 dark:hover:text-brand-100"
            >
              Explore Flowtomic →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}