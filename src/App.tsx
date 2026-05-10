import {
  Activity,
  FlaskConical,
  Github,
  Save,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AdvancedPanel } from './components/AdvancedPanel';
import { BatchPanel } from './components/BatchPanel';
import { DetectPanel } from './components/DetectPanel';
import { EmbedPanel } from './components/EmbedPanel';
import { ImageDropzone } from './components/ImageDropzone';
import { MetadataPanel } from './components/MetadataPanel';
import { PreviewCompare } from './components/PreviewCompare';
import { ResultPanel } from './components/ResultPanel';
import { StatusLog } from './components/StatusLog';
import { ThemeToggle } from './components/ThemeToggle';
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

const SAMPLE_JSON = '{\n  "owner": "Alice",\n  "asset": "campaign-2026-05",\n  "license": "internal"\n}';

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

export default function App() {
  const [dark, setDark] = useState(() => localStorage.theme === 'dark');
  const [busy, setBusy] = useState(false);
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
    return `${capacity.maxPayloadBytes.toLocaleString()} bytes payload`;
  }, [sourceImage, algorithm, repetition]);

  function addLog(message: string) {
    const time = new Date().toLocaleTimeString();
    setLogs((items) => [`${time} ${message}`, ...items].slice(0, 12));
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

    if (payloadKind === 'json') {
      JSON.parse(payloadText);
    }

    return {
      kind: payloadKind,
      text: payloadText,
      compress,
      encrypt,
      password,
    };
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
      if (!shared) {
        await handleSaveImage();
      } else {
        addLog('已调用系统分享');
      }
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
      const jpegResult = await extractWatermark(jpeg, {
        algorithm,
        key: keyText,
        password,
        strength,
        repetition,
      });
      const scaled = await imageRoundTrip(watermarkedImage, 'image/png', 0.95, 0.85);
      const scaledResult = await extractWatermark(scaled, {
        algorithm,
        key: keyText,
        password,
        strength,
        repetition,
      });
      addLog(`压缩测试：${jpegResult.ok ? '通过' : jpegResult.reason}`);
      addLog(`缩放测试：${scaledResult.ok ? '通过' : scaledResult.reason}`);
    } catch (error) {
      addLog(error instanceof Error ? error.message : '鲁棒性测试失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink dark:bg-[#111714] dark:text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-copper">
              <ShieldCheck size={16} />
              Local-first blind watermark
            </div>
            <h1 className="mt-1 text-3xl font-bold">盲水印图片生成与解析工具</h1>
          </div>
          <div className="flex items-center gap-2">
            <a className="icon-button" href="https://github.com/" target="_blank" rel="noreferrer" title="GitHub">
              <Github size={18} />
            </a>
            <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
          </div>
        </header>

        <ImageDropzone
          busy={busy}
          fileName={sourceFile?.name}
          previewUrl={sourcePreview}
          onFiles={(files) => void handleFiles(files)}
        />

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <AdvancedPanel
              algorithm={algorithm}
              setAlgorithm={setAlgorithm}
              keyText={keyText}
              setKeyText={setKeyText}
              strength={strength}
              setStrength={setStrength}
              repetition={repetition}
              setRepetition={setRepetition}
              compress={compress}
              setCompress={setCompress}
              encrypt={encrypt}
              setEncrypt={setEncrypt}
              password={password}
              setPassword={setPassword}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <EmbedPanel
                payloadKind={payloadKind}
                setPayloadKind={(value) => {
                  setPayloadKind(value);
                  if (value === 'json' && payloadText === 'BlindWaterMark local payload') setPayloadText(SAMPLE_JSON);
                }}
                payloadText={payloadText}
                setPayloadText={setPayloadText}
                payloadFile={payloadFile}
                setPayloadFile={setPayloadFile}
                busy={busy}
                disabled={!sourceImage}
                onEmbed={() => void handleEmbed()}
              />
              <div className="space-y-4">
                <DetectPanel
                  algorithm={detectAlgorithm}
                  setAlgorithm={setDetectAlgorithm}
                  busy={busy}
                  disabled={!sourceImage && !watermarkedImage}
                  onDetect={() => void handleDetect()}
                />
                <section className="panel rounded-md p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Activity size={18} />
                    <h2 className="font-semibold">操作</h2>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button className="secondary-button" type="button" disabled={!watermarkedImage} onClick={handleSaveImage}>
                      <Save size={16} />
                      保存
                    </button>
                    <button className="secondary-button" type="button" disabled={!watermarkedImage} onClick={handleShareImage}>
                      <Share2 size={16} />
                      分享
                    </button>
                    <button className="secondary-button" type="button" disabled={!watermarkedImage || busy} onClick={handleRobustnessTest}>
                      <FlaskConical size={16} />
                      测试
                    </button>
                  </div>
                  <div className="mt-3 rounded-md bg-black/[0.04] p-3 text-sm dark:bg-white/[0.06]">
                    当前容量：{capacityText}
                  </div>
                </section>
              </div>
            </div>

            <PreviewCompare original={sourcePreview} watermarked={watermarkedPreview} />
          </div>

          <aside className="space-y-4">
            <ResultPanel
              result={result}
              onCopy={() => void handleCopyResult()}
              onExportJson={() => void handleExportJson()}
              onExportFile={() => void handleExportFile()}
            />
            <MetadataPanel metadata={metadata} />
            <BatchPanel
              items={batchItems}
              busy={busy}
              onFiles={handleBatchFiles}
              onProcess={() => void handleBatchProcess()}
            />
            <StatusLog logs={logs} />
          </aside>
        </div>

        <footer className="pb-4 text-sm text-ink/60 dark:text-white/55">
          DCT 默认模式适合 PNG 与轻度 JPEG 流程；强压缩、裁剪、重采样会降低解析成功率。
        </footer>
      </div>
    </main>
  );
}
