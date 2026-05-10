import { FileUp, Play, Type } from 'lucide-react';
import type { PayloadKind } from '../lib/watermark/types';

interface EmbedPanelProps {
  payloadKind: PayloadKind;
  setPayloadKind: (value: PayloadKind) => void;
  payloadText: string;
  setPayloadText: (value: string) => void;
  payloadFile?: File | null;
  setPayloadFile: (value: File | null) => void;
  busy: boolean;
  disabled: boolean;
  onEmbed: () => void;
}

export function EmbedPanel(props: EmbedPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Type size={18} />
          <h2 className="font-semibold">嵌入水印</h2>
        </div>
        <button className="primary-button" type="button" disabled={props.disabled || props.busy} onClick={props.onEmbed}>
          <Play size={17} />
          嵌入
        </button>
      </div>

      <div className="mb-3 segmented grid-cols-3">
        {(['text', 'json', 'file'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            data-active={props.payloadKind === kind}
            onClick={() => props.setPayloadKind(kind)}
          >
            {kind === 'text' ? '文本' : kind === 'json' ? 'JSON' : '文件'}
          </button>
        ))}
      </div>

      {props.payloadKind === 'file' ? (
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-black/20 bg-paper/70 p-4 text-center dark:border-white/15 dark:bg-black/20">
          <FileUp size={24} />
          <span className="mt-2 text-sm">{props.payloadFile?.name ?? '选择小型文件 payload'}</span>
          <input
            className="hidden"
            type="file"
            onChange={(event) => props.setPayloadFile(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <textarea
          className="control min-h-40 w-full resize-y"
          value={props.payloadText}
          onChange={(event) => props.setPayloadText(event.target.value)}
          spellCheck={false}
          placeholder={props.payloadKind === 'json' ? '{"owner":"Alice","asset":"image-001"}' : '输入要嵌入的文本'}
        />
      )}
    </section>
  );
}
