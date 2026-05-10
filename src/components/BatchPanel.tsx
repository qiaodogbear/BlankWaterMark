import { Files, Play } from 'lucide-react';

interface BatchItem {
  name: string;
  status: string;
  url?: string;
}

interface BatchPanelProps {
  items: BatchItem[];
  busy: boolean;
  onFiles: (files: FileList | File[]) => void;
  onProcess: () => void;
}

export function BatchPanel({ items, busy, onFiles, onProcess }: BatchPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Files size={18} />
          <h2 className="font-semibold">批量处理</h2>
        </div>
        <button className="secondary-button" type="button" disabled={!items.length || busy} onClick={onProcess}>
          <Play size={16} />
          批量嵌入
        </button>
      </div>

      <label className="mb-3 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-black/20 bg-paper/70 px-3 py-4 text-sm dark:border-white/15 dark:bg-black/20">
        添加图片队列
        <input
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) => {
            if (event.target.files) onFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
      </label>

      <div className="space-y-2 text-sm">
        {items.length ? (
          items.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
              <span className="min-w-0 truncate">{item.name}</span>
              {item.url ? (
                <a className="font-semibold text-copper" href={item.url} download={`watermarked-${item.name}`}>
                  下载
                </a>
              ) : (
                <span className="text-ink/60 dark:text-white/60">{item.status}</span>
              )}
            </div>
          ))
        ) : (
          <div className="rounded-md bg-black/[0.04] px-3 py-2 text-ink/60 dark:bg-white/[0.06] dark:text-white/60">
            队列为空
          </div>
        )}
      </div>
    </section>
  );
}
