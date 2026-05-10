import { SearchCheck } from 'lucide-react';
import type { WatermarkAlgorithm } from '../lib/watermark';

interface DetectPanelProps {
  algorithm: WatermarkAlgorithm;
  setAlgorithm: (value: WatermarkAlgorithm) => void;
  busy: boolean;
  disabled: boolean;
  onDetect: () => void;
}

export function DetectPanel({ algorithm, setAlgorithm, busy, disabled, onDetect }: DetectPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SearchCheck size={18} />
          <h2 className="font-semibold">检测 / 解析</h2>
        </div>
        <button className="secondary-button" type="button" disabled={disabled || busy} onClick={onDetect}>
          <SearchCheck size={17} />
          解析
        </button>
      </div>

      <div className="segmented grid-cols-3">
        {(['auto', 'dct', 'lsb'] as const).map((item) => (
          <button key={item} type="button" data-active={algorithm === item} onClick={() => setAlgorithm(item)}>
            {item === 'auto' ? 'AUTO' : item.toUpperCase()}
          </button>
        ))}
      </div>
    </section>
  );
}
