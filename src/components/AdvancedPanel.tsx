import { Gauge, KeyRound, Repeat, Shield } from 'lucide-react';
import type { ConcreteWatermarkAlgorithm } from '../lib/watermark';

interface AdvancedPanelProps {
  algorithm: ConcreteWatermarkAlgorithm;
  setAlgorithm: (value: ConcreteWatermarkAlgorithm) => void;
  keyText: string;
  setKeyText: (value: string) => void;
  strength: number;
  setStrength: (value: number) => void;
  repetition: number;
  setRepetition: (value: number) => void;
  compress: boolean;
  setCompress: (value: boolean) => void;
  encrypt: boolean;
  setEncrypt: (value: boolean) => void;
  password: string;
  setPassword: (value: string) => void;
}

export function AdvancedPanel(props: AdvancedPanelProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={18} />
        <h2 className="font-semibold">高级设置</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2">
          <span className="label">算法</span>
          <div className="segmented grid-cols-2">
            {(['dct', 'lsb'] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-active={props.algorithm === item}
                onClick={() => props.setAlgorithm(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </label>

        <label className="grid gap-2">
          <span className="label inline-flex items-center gap-1">
            <KeyRound size={14} />
            密钥
          </span>
          <input
            className="control"
            value={props.keyText}
            onChange={(event) => props.setKeyText(event.target.value)}
            placeholder="可留空"
          />
        </label>

        <label className="grid gap-2">
          <span className="label inline-flex items-center gap-1">
            <Gauge size={14} />
            强度 {props.strength}
          </span>
          <input
            type="range"
            min={8}
            max={64}
            step={2}
            value={props.strength}
            onChange={(event) => props.setStrength(Number(event.target.value))}
          />
        </label>

        <label className="grid gap-2">
          <span className="label inline-flex items-center gap-1">
            <Repeat size={14} />
            冗余
          </span>
          <select
            className="control"
            value={props.repetition}
            onChange={(event) => props.setRepetition(Number(event.target.value))}
          >
            <option value={1}>1x 高容量</option>
            <option value={3}>3x 默认</option>
            <option value={5}>5x 高鲁棒</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[auto_auto_1fr]">
        <label className="flex items-center gap-2 text-sm">
          <input checked={props.compress} type="checkbox" onChange={(event) => props.setCompress(event.target.checked)} />
          压缩 payload
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input checked={props.encrypt} type="checkbox" onChange={(event) => props.setEncrypt(event.target.checked)} />
          AES-GCM 加密
        </label>
        <input
          className="control"
          type="password"
          value={props.password}
          onChange={(event) => props.setPassword(event.target.value)}
          placeholder="payload 密码"
        />
      </div>
    </section>
  );
}
