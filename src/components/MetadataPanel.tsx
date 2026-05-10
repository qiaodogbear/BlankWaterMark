import { Info } from 'lucide-react';

interface MetadataPanelProps {
  metadata: Record<string, string>;
}

export function MetadataPanel({ metadata }: MetadataPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center gap-2">
        <Info size={18} />
        <h2 className="font-semibold">图片元数据</h2>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className="rounded-md border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
            <dt className="label">{key}</dt>
            <dd className="mt-1 break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
