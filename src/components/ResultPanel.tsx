import { ClipboardCopy, Download, FileJson, PackageOpen } from 'lucide-react';
import type { ExtractResult } from '../lib/watermark';

interface ResultPanelProps {
  result: ExtractResult | null;
  onCopy: () => void;
  onExportJson: () => void;
  onExportFile: () => void;
}

export function ResultPanel({ result, onCopy, onExportJson, onExportFile }: ResultPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center gap-2">
        <PackageOpen size={18} />
        <h2 className="font-semibold">解析结果</h2>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-black/[0.04] p-3 dark:bg-white/[0.06]">
              <div className="label">状态</div>
              <div className="mt-1 font-semibold">{result.ok ? '通过' : '失败'}</div>
            </div>
            <div className="rounded-md bg-black/[0.04] p-3 dark:bg-white/[0.06]">
              <div className="label">置信度</div>
              <div className="mt-1 font-semibold">{Math.round(result.confidence * 100)}%</div>
            </div>
            <div className="rounded-md bg-black/[0.04] p-3 dark:bg-white/[0.06]">
              <div className="label">算法</div>
              <div className="mt-1 font-semibold">{String(result.algorithm).toUpperCase()}</div>
            </div>
            <div className="rounded-md bg-black/[0.04] p-3 dark:bg-white/[0.06]">
              <div className="label">数据长度</div>
              <div className="mt-1 font-semibold">{result.dataLength} bytes</div>
            </div>
          </div>

          {result.payload?.text ? (
            <pre className="max-h-56 overflow-auto rounded-md bg-ink p-3 text-sm text-white">{result.payload.text}</pre>
          ) : (
            <div className="rounded-md bg-black/[0.04] p-3 text-sm dark:bg-white/[0.06]">
              {result.reason ?? (result.payload?.kind === 'file' ? result.payload.fileName ?? '文件 payload' : '无文本')}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" type="button" disabled={!result.ok} onClick={onCopy}>
              <ClipboardCopy size={16} />
              复制
            </button>
            <button className="secondary-button" type="button" disabled={!result.ok} onClick={onExportJson}>
              <FileJson size={16} />
              JSON
            </button>
            <button className="secondary-button" type="button" disabled={!result.payload?.bytes.length} onClick={onExportFile}>
              <Download size={16} />
              文件
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-black/[0.04] p-3 text-sm text-ink/60 dark:bg-white/[0.06] dark:text-white/60">
          尚未解析
        </div>
      )}
    </section>
  );
}
