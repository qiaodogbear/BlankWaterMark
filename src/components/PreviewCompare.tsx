import { Columns2 } from 'lucide-react';
import { useState } from 'react';

interface PreviewCompareProps {
  original?: string;
  watermarked?: string;
}

export function PreviewCompare({ original, watermarked }: PreviewCompareProps) {
  const [split, setSplit] = useState(50);

  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center gap-2">
        <Columns2 size={18} />
        <h2 className="font-semibold">预览对比</h2>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-black/10 bg-white dark:border-white/10 dark:bg-white/10">
        {original ? <img className="absolute inset-0 h-full w-full object-contain" src={original} alt="original" /> : null}
        {watermarked ? (
          <div className="absolute inset-0 overflow-hidden" style={{ width: `${split}%` }}>
            <img className="h-full w-full max-w-none object-contain" src={watermarked} alt="watermarked" />
          </div>
        ) : null}
        {!original && !watermarked ? (
          <div className="flex h-full items-center justify-center text-sm text-ink/55 dark:text-white/55">等待图片</div>
        ) : null}
        {watermarked ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white">
            水印图 {split}%
          </div>
        ) : null}
      </div>

      <input
        className="mt-4 w-full"
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        disabled={!watermarked}
      />
    </section>
  );
}
