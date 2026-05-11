import {
  Activity,
  Archive,
  Columns2,
  FileImage,
  FlaskConical,
  Github,
  Info,
  Layers,
  ListChecks,
  Lock,
  PackageOpen,
  Play,
  Save,
  SearchCheck,
  Share2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { BatchPanel } from './components/BatchPanel';
import { MetadataPanel } from './components/MetadataPanel';
import { ResultPanel } from './components/ResultPanel';
import { StatusLog } from './components/StatusLog';
import { ThemeToggle } from './components/ThemeToggle';
import { measureWatermarkUsage, type WatermarkUsage } from './lib/capacity';
import {
  embedWatermark,
  estimateCapacity,
  extractWatermark,
  type ConcreteWatermarkAlgorithm,
  type ExtractResult,
  type PayloadInput,
  type RgbaImage,
  type WatermarkAlgorithm,
} from './lib/watermark';
import type { PayloadKind } from './lib/watermark/types';
import {
  collectImageMetadata,
  fileToImageData,
  imageDataToBlob,
  imageDataToCanvas,
  imageDataToDataUrl,
  validateImageFileMeta,
} from './lib/image';

interface BatchItem {
  file: File;
  name: string;
  status: string;
  url?: string;
}

type ModalKey = 'result' | 'metadata' | 'logs' | 'batch' | null;

const SAMPLE_JSON = '{\n  "owner": "Alice",\n  "asset": "campaign-2026-05",\n  "license": "internal"\n}';

const EMBED_ALGORITHMS: Array<{
  id: ConcreteWatermarkAlgorithm;
  title: string;
  subtitle: string;
  bestFor: string;
}> = [
  {
    id: 'dct',
    title: '稳健盲水印',
    subtitle: 'DCT 频域',
    bestFor: '推荐。适合版权追踪，可承受轻度压缩。',
  },
  {
    id: 'lsb',
    title: '轻量隐写',
    subtitle: 'LSB 像素位',
    bestFor: '容量更大。适合本地传输，不适合 JPEG 重压缩。',
  },
];

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  if (isTauriRuntime()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: 'Image', extensions: ['png'] }],
    });
    if (!path) return;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (!navigator.canShare || !navigator.share) return false;
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title: 'BlindWaterMark image' });
  return true;
}

async function imageRoundTrip(image: RgbaImage, type: string, quality: number, scale = 1): Promise<RgbaImage> {
  const source = imageDataToCanvas(image);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(image.width * scale));
  canvas.height = Math.max(16, Math.round(image.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建鲁棒性测试画布');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('模拟导出失败'))), type, quality);
  });
  return fileToImageData(new File([blob], 'robustness.jpg', { type }));
}

function CompactButton({
  children,
  disabled,
  onClick,
  tone = 'secondary',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <button
      className={tone === 'primary' ? 'primary-button min-h-10 px-3' : 'secondary-button min-h-10 px-3'}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="panel max-h-[86vh] w-full max-w-4xl overflow-auto rounded-md p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dark, setDark] = useState(() => localStorage.theme === 'dark');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceImage, setSourceImage] = useState<RgbaImage | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string>('');
  const [watermarkedImage, setWatermarkedImage] = useState<RgbaImage | null>(null);
  const [watermarkedPreview, setWatermarkedPreview] = useState<string>('');
  const [payloadKind, setPayloadKind] = useState<PayloadKind>('text');
  const [payloadText, setPayloadText] = useState('BlindWaterMark local payload');
  const [payloadFile, setPayloadFile] = useState<File | null>(null);
  const [algorithm, setAlgorithm] = useState<ConcreteWatermarkAlgorithm>('dct');
  const [detectAlgorithm, setDetectAlgorithm] = useState<WatermarkAlgorithm>('auto');
  const [keyText, setKeyText] = useState('');
  const [strength, setStrength] = useState(28);
  const [repetition, setRepetition] = useState(3);
  const [compress, setCompress] = useState(true);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [split, setSplit] = useState(50);
  const [modal, setModal] = useState<ModalKey>(null);
  const [capacityUsage, setCapacityUsage] = useState<WatermarkUsage | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length) void handleFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const metadata = useMemo(() => collectImageMetadata(sourceFile, sourceImage), [sourceFile, sourceImage]);
  const capacityText = useMemo(() => {
    if (!sourceImage) return '未加载图片';
    const capacity = estimateCapacity(sourceImage, algorithm, repetition);
    return `${capacity.maxPayloadBytes.toLocaleString()} bytes`;
  }, [sourceImage, algorithm, repetition]);

  useEffect(() => {
    let active = true;

    async function updateUsage() {
      let payload: PayloadInput | null = null;

      if (payloadKind === 'file') {
        if (payloadFile) {
          payload = {
            kind: 'file',
            bytes: new Uint8Array(await payloadFile.arrayBuffer()),
            fileName: payloadFile.name,
            mimeType: payloadFile.type || 'application/octet-stream',
            compress,
            encrypt,
            password,
          };
        }
      } else {
        payload = {
          kind: payloadKind,
          text: payloadText,
          compress,
          encrypt,
          password,
        };
      }

      const usage = await measureWatermarkUsage(sourceImage, algorithm, repetition, payload);
      if (active) setCapacityUsage(usage);
    }

    void updateUsage();

    return () => {
      active = false;
    };
  }, [algorithm, compress, encrypt, password, payloadFile, payloadKind, payloadText, repetition, sourceImage]);

  const statusText = result
    ? result.ok
      ? `解析成功，置信度 ${Math.round(result.confidence * 100)}%`
      : result.reason ?? '解析失败'
    : watermarkedImage
      ? '已生成水印图'
      : sourceImage
        ? '图片已载入'
        : '等待图片';

  function addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    setLogs((items) => [`${time} ${message}`, ...items].slice(0, 16));
  }

  async function handleFiles(filesLike: FileList | File[]) {
    const file = Array.from(filesLike)[0];
    if (!file) return;
    const validation = validateImageFileMeta(file);
    if (!validation.ok) {
      addLog(validation.error ?? '图片验证失败');
      return;
    }

    setBusy(true);
    try {
      const image = await fileToImageData(file);
      setSourceFile(file);
      setSourceImage(image);
      setWatermarkedImage(null);
      setWatermarkedPreview('');
      setResult(null);
      setSourcePreview(imageDataToDataUrl(image));
      addLog(`已载入 ${file.name} (${image.width}x${image.height})`);
    } catch (error) {
      addLog(error instanceof Error ? error.message : '图片读取失败');
    } finally {
      setBusy(false);
    }
  }

  async function createPayload(): Promise<PayloadInput> {
    if (payloadKind === 'file') {
      if (!payloadFile) throw new Error('请选择 payload 文件');
      if (payloadFile.size > 128 * 1024) throw new Error('文件 payload 超过 128KB 限制');
      return {
        kind: 'file',
        bytes: new Uint8Array(await payloadFile.arrayBuffer()),
        fileName: payloadFile.name,
        mimeType: payloadFile.type || 'application/octet-stream',
        compress,
        encrypt,
        password,
      };
    }

    if (payloadKind === 'json') JSON.parse(payloadText);
    return { kind: payloadKind, text: payloadText, compress, encrypt, password };
  }

  async function handleEmbed() {
    if (!sourceImage) {
      addLog('请先选择图片');
      return;
    }
    setBusy(true);
    try {
      const payload = await createPayload();
      const embedded = await embedWatermark(sourceImage, {
        algorithm,
        payload,
        key: keyText,
        strength,
        repetition,
      });
      setWatermarkedImage(embedded.image);
      setWatermarkedPreview(imageDataToDataUrl(embedded.image));
      setResult(null);
      addLog(`${embedded.message}，容量 ${capacityText}`);
    } catch (error) {
      addLog(error instanceof Error ? error.message : '水印嵌入失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleDetect(image = watermarkedImage ?? sourceImage) {
    if (!image) {
      addLog('请先选择要解析的图片');
      return;
    }
    setBusy(true);
    try {
      const parsed = await extractWatermark(image, {
        algorithm: detectAlgorithm,
        key: keyText,
        password,
        strength,
        repetition,
      });
      setResult(parsed);
      addLog(parsed.ok ? `解析成功，置信度 ${Math.round(parsed.confidence * 100)}%` : parsed.reason ?? '解析失败');
    } catch (error) {
      addLog(error instanceof Error ? error.message : '水印解析失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveImage() {
    if (!watermarkedImage) {
      addLog('没有可保存的水印图');
      return;
    }
    try {
      await saveBlob(await imageDataToBlob(watermarkedImage), 'blind-watermarked.png');
      addLog('水印图已导出');
    } catch (error) {
      addLog(error instanceof Error ? error.message : '图片导出失败');
    }
  }

  async function handleShareImage() {
    if (!watermarkedImage) {
      addLog('没有可分享的水印图');
      return;
    }
    try {
      const shared = await shareBlob(await imageDataToBlob(watermarkedImage), 'blind-watermarked.png');
      if (!shared) await handleSaveImage();
      else addLog('已调用系统分享');
    } catch (error) {
      addLog(error instanceof Error ? error.message : '分享失败');
    }
  }

  async function handleCopyResult() {
    if (!result?.payload?.text) return;
    await navigator.clipboard.writeText(result.payload.text);
    addLog('结果文本已复制');
  }

  async function handleExportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    await saveBlob(blob, 'watermark-result.json');
    addLog('解析结果 JSON 已导出');
  }

  async function handleExportFile() {
    if (!result?.payload?.bytes.length) return;
    const name = result.payload.fileName ?? (result.payload.kind === 'json' ? 'payload.json' : 'payload.txt');
    const type = result.payload.mimeType ?? 'application/octet-stream';
    await saveBlob(new Blob([result.payload.bytes], { type }), name);
    addLog('payload 文件已导出');
  }

  function handleBatchFiles(filesLike: FileList | File[]) {
    const next = Array.from(filesLike).map((file) => ({ file, name: file.name, status: '等待' }));
    setBatchItems((items) => [...items, ...next]);
  }

  async function handleBatchProcess() {
    if (!batchItems.length) return;
    setBusy(true);
    try {
      const payload = await createPayload();
      const next: BatchItem[] = [];
      for (const item of batchItems) {
        try {
          const image = await fileToImageData(item.file);
          const embedded = await embedWatermark(image, { algorithm, payload, key: keyText, strength, repetition });
          const blob = await imageDataToBlob(embedded.image);
          next.push({ ...item, status: '完成', url: URL.createObjectURL(blob) });
        } catch (error) {
          next.push({ ...item, status: error instanceof Error ? error.message : '失败' });
        }
      }
      setBatchItems(next);
      addLog(`批量处理完成：${next.filter((item) => item.url).length}/${next.length}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRobustnessTest() {
    if (!watermarkedImage) {
      addLog('请先生成水印图');
      return;
    }
    setBusy(true);
    try {
      const jpeg = await imageRoundTrip(watermarkedImage, 'image/jpeg', 0.88, 1);
      const jpegResult = await extractWatermark(jpeg, { algorithm, key: keyText, password, strength, repetition });
      const scaled = await imageRoundTrip(watermarkedImage, 'image/png', 0.95, 0.85);
      const scaledResult = await extractWatermark(scaled, { algorithm, key: keyText, password, strength, repetition });
      addLog(`压缩测试：${jpegResult.ok ? '通过' : jpegResult.reason}`);
      addLog(`缩放测试：${scaledResult.ok ? '通过' : scaledResult.reason}`);
      setModal('logs');
    } catch (error) {
      addLog(error instanceof Error ? error.message : '鲁棒性测试失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink dark:bg-[#111714] dark:text-white lg:h-screen lg:overflow-hidden">
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-3 px-3 py-3 lg:h-screen lg:min-h-0">
        <header className="panel flex h-auto shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-copper">
              <ShieldCheck size={15} />
              Local-first blind watermark
            </div>
            <h1 className="truncate text-xl font-bold">盲水印图片生成与解析工具</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="icon-button" type="button" onClick={() => setModal('logs')} title="日志">
              <ListChecks size={18} />
            </button>
            <a className="icon-button" href="https://github.com/" target="_blank" rel="noreferrer" title="GitHub">
              <Github size={18} />
            </a>
            <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.18fr)_minmax(420px,0.82fr)]">
          <section className="panel flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-md lg:min-h-0">
            <div
              className={clsx(
                'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10',
                dragging && 'bg-mint/80 dark:bg-mint/10',
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileImage size={17} />
                  {sourceFile?.name ?? '拖拽、选择或粘贴图片'}
                </div>
                <div className="mt-1 text-xs text-ink/60 dark:text-white/55">
                  {sourceImage ? `${sourceImage.width}x${sourceImage.height} · 容量 ${capacityText}` : 'PNG / JPEG / WEBP'}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <CompactButton disabled={busy} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} />
                  选择图片
                </CompactButton>
                <CompactButton disabled={!watermarkedImage} onClick={() => void handleSaveImage()}>
                  <Save size={16} />
                  保存
                </CompactButton>
                <CompactButton disabled={!watermarkedImage} onClick={() => void handleShareImage()}>
                  <Share2 size={16} />
                  分享
                </CompactButton>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-white/55 dark:bg-black/20">
              {sourcePreview ? (
                <img className="absolute inset-0 h-full w-full object-contain p-3" src={sourcePreview} alt="原图" />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink/55 dark:text-white/55">
                  载入图片后可直接嵌入或解析盲水印
                </div>
              )}

              {watermarkedPreview ? (
                <img
                  className="absolute inset-0 h-full w-full object-contain p-3"
                  src={watermarkedPreview}
                  alt="水印图"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                />
              ) : null}

              {watermarkedPreview ? (
                <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-md border border-black/10 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/70">
                  <Columns2 size={16} />
                  <input
                    className="min-w-0 flex-1"
                    type="range"
                    min={0}
                    max={100}
                    value={split}
                    onChange={(event) => setSplit(Number(event.target.value))}
                  />
                  <span className="w-16 text-right text-xs font-semibold">水印 {split}%</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel flex min-h-[520px] min-w-0 flex-col gap-3 overflow-hidden rounded-md p-3 lg:min-h-0">
            <div className="grid shrink-0 gap-2 sm:grid-cols-2">
              {EMBED_ALGORITHMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={clsx(
                    'rounded-md border p-3 text-left transition',
                    algorithm === item.id
                      ? 'border-copper bg-mint/75 text-ink shadow-sm dark:bg-mint dark:text-ink'
                      : 'border-black/10 bg-white/80 hover:border-copper dark:border-white/10 dark:bg-white/[0.06]',
                  )}
                  onClick={() => setAlgorithm(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <span className="rounded bg-black/10 px-1.5 py-0.5 text-[11px] font-bold dark:bg-white/15">
                      {item.subtitle}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-ink/65 dark:text-white/60">{item.bestFor}</div>
                </button>
              ))}
            </div>

            <div className="grid shrink-0 gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="mb-1 text-xs font-semibold text-ink/60 dark:text-white/55">解析策略</div>
                <div className="segmented grid-cols-3">
                {(['auto', 'dct', 'lsb'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-active={detectAlgorithm === item}
                    onClick={() => setDetectAlgorithm(item)}
                  >
                    {item === 'auto' ? '自动' : item === 'dct' ? '稳健' : '轻量'}
                  </button>
                ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-ink/60 dark:text-white/55">冗余倍率</div>
                <div className="segmented grid w-64 grid-cols-3">
                  {[
                    { value: 1, label: '1x', hint: '容量高' },
                    { value: 3, label: '3x', hint: '推荐' },
                    { value: 5, label: '5x', hint: '更稳' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      data-active={repetition === item.value}
                      onClick={() => setRepetition(item.value)}
                      title={`${item.label} 冗余：${item.hint}`}
                    >
                      <span className="block leading-4">{item.label}</span>
                      <span className="block text-[10px] font-medium opacity-70">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid shrink-0 gap-2 sm:grid-cols-[1fr_140px]">
              <input
                className="control h-10"
                value={keyText}
                onChange={(event) => setKeyText(event.target.value)}
                placeholder="密钥，可留空"
              />
              <div className="control flex h-10 items-center gap-2 px-2">
                <span className="text-xs font-semibold">强度</span>
                <input
                  className="min-w-0 flex-1"
                  type="range"
                  min={8}
                  max={64}
                  step={2}
                  value={strength}
                  onChange={(event) => setStrength(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="segmented grid w-52 grid-cols-3">
                {(['text', 'json', 'file'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-active={payloadKind === kind}
                    onClick={() => {
                      setPayloadKind(kind);
                      if (kind === 'json' && payloadText === 'BlindWaterMark local payload') setPayloadText(SAMPLE_JSON);
                    }}
                  >
                    {kind === 'text' ? '文本' : kind === 'json' ? 'JSON' : '文件'}
                  </button>
                ))}
              </div>
              <label
                className={clsx(
                  'secondary-button min-h-10 cursor-pointer px-3',
                  compress && 'border-copper bg-mint/70 text-ink dark:bg-mint dark:text-ink',
                )}
              >
                <Archive size={16} />
                压缩
                <input className="sr-only" type="checkbox" checked={compress} onChange={(event) => setCompress(event.target.checked)} />
              </label>
              <label
                className={clsx(
                  'secondary-button min-h-10 cursor-pointer px-3',
                  encrypt && 'border-copper bg-mint/70 text-ink dark:bg-mint dark:text-ink',
                )}
              >
                <Lock size={16} />
                加密
                <input className="sr-only" type="checkbox" checked={encrypt} onChange={(event) => setEncrypt(event.target.checked)} />
              </label>
            </div>

            <div className="min-h-0 flex-1">
              {payloadKind === 'file' ? (
                <label className="flex h-full min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-black/20 bg-paper/70 p-4 text-center text-sm dark:border-white/15 dark:bg-black/20">
                  <Upload size={22} />
                  <span className="mt-2">{payloadFile?.name ?? '选择小型文件 payload'}</span>
                  <input className="hidden" type="file" onChange={(event) => setPayloadFile(event.target.files?.[0] ?? null)} />
                </label>
              ) : (
                <textarea
                  className="control h-full min-h-28 w-full resize-none"
                  value={payloadText}
                  onChange={(event) => setPayloadText(event.target.value)}
                  spellCheck={false}
                  placeholder={payloadKind === 'json' ? SAMPLE_JSON : '输入要嵌入的文本'}
                />
              )}
            </div>

            <input
              className="control h-10 shrink-0"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="payload 加密/解析密码"
            />
            <div className="shrink-0 rounded-md bg-black/[0.04] px-3 py-2 text-xs leading-5 text-ink/65 dark:bg-white/[0.06] dark:text-white/60">
              密钥用于控制水印位置；开启加密后，payload 内容使用 AES-GCM 加密，解析时必须输入相同密码。
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2">
              <CompactButton tone="primary" disabled={!sourceImage || busy} onClick={() => void handleEmbed()}>
                <Play size={17} />
                嵌入水印
              </CompactButton>
              <CompactButton disabled={(!sourceImage && !watermarkedImage) || busy} onClick={() => void handleDetect()}>
                <SearchCheck size={17} />
                检测解析
              </CompactButton>
            </div>

            <div className="grid shrink-0 grid-cols-4 gap-2">
              <CompactButton disabled={!watermarkedImage || busy} onClick={() => void handleRobustnessTest()}>
                <FlaskConical size={16} />
                测试
              </CompactButton>
              <CompactButton onClick={() => setModal('result')}>
                <PackageOpen size={16} />
                结果
              </CompactButton>
              <CompactButton onClick={() => setModal('metadata')}>
                <Info size={16} />
                元数据
              </CompactButton>
              <CompactButton onClick={() => setModal('batch')}>
                <Layers size={16} />
                批量
              </CompactButton>
            </div>

            <div className="shrink-0 rounded-md border border-black/10 bg-white/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{statusText}</span>
                {busy ? <span className="shrink-0 text-copper">处理中</span> : null}
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-ink/60 dark:text-white/55">
                  <span>水印数据占用</span>
                  <span className="font-semibold">{capacityUsage?.label ?? '未计算'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      capacityUsage && !capacityUsage.ok ? 'bg-red-500' : 'bg-copper',
                    )}
                    style={{ width: `${Math.max(0, Math.min(100, capacityUsage?.percent ?? 0))}%` }}
                  />
                </div>
                {capacityUsage?.reason ? (
                  <div className="mt-1 text-xs text-copper">{capacityUsage.reason}</div>
                ) : (
                  <div className="mt-1 text-xs text-ink/55 dark:text-white/50">
                    进度越高越接近图片容量上限，建议保留余量以提高解析稳定性。
                  </div>
                )}
              </div>
              {result?.payload?.text ? (
                <div className="mt-2 line-clamp-2 break-words text-ink/65 dark:text-white/60">{result.payload.text}</div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="panel flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-xs text-ink/65 dark:text-white/60">
          <span className="min-w-0 truncate">DCT 适合 PNG 与轻度 JPEG；强压缩、裁剪、重采样会降低解析成功率。</span>
          <button className="inline-flex shrink-0 items-center gap-1 font-semibold text-copper" type="button" onClick={() => setModal('logs')}>
            <Activity size={14} />
            查看日志
          </button>
        </footer>
      </div>

      <Modal title="解析结果" open={modal === 'result'} onClose={() => setModal(null)}>
        <ResultPanel
          result={result}
          onCopy={() => void handleCopyResult()}
          onExportJson={() => void handleExportJson()}
          onExportFile={() => void handleExportFile()}
        />
      </Modal>

      <Modal title="图片元数据" open={modal === 'metadata'} onClose={() => setModal(null)}>
        <MetadataPanel metadata={metadata} />
      </Modal>

      <Modal title="操作日志" open={modal === 'logs'} onClose={() => setModal(null)}>
        <StatusLog logs={logs} />
      </Modal>

      <Modal title="批量处理" open={modal === 'batch'} onClose={() => setModal(null)}>
        <BatchPanel
          items={batchItems}
          busy={busy}
          onFiles={handleBatchFiles}
          onProcess={() => void handleBatchProcess()}
        />
      </Modal>
    </main>
  );
}
