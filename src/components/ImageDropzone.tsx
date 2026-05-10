import { Clipboard, FileImage, ImagePlus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import clsx from 'clsx';

interface ImageDropzoneProps {
  fileName?: string;
  previewUrl?: string;
  busy?: boolean;
  onFiles: (files: FileList | File[]) => void;
}

export function ImageDropzone({ fileName, previewUrl, busy, onFiles }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section
      className={clsx(
        'panel rounded-md p-4 transition',
        dragging ? 'border-copper bg-mint/80 dark:bg-mint/10' : 'border-black/10',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="flex min-h-52 flex-col items-start justify-between rounded-md border border-dashed border-black/20 bg-paper/70 p-5 dark:border-white/15 dark:bg-black/20">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-ink text-white dark:bg-mint dark:text-ink">
              <ImagePlus size={22} />
            </div>
            <div>
              <h2 className="text-xl font-semibold">BlindWaterMark</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/70 dark:text-white/65">
                本地盲水印嵌入、检测、解析与导出。图片不会上传到服务器；盲水印可增强追踪能力，但不能保证不可破坏。
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={17} />
              选择图片
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FileImage size={17} />
              图库
            </button>
            <span className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm text-ink/60 dark:border-white/10 dark:text-white/60">
              <Clipboard size={16} />
              支持粘贴
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-black/10 bg-white dark:border-white/10 dark:bg-white/10">
          {previewUrl ? (
            <img className="h-full min-h-52 w-full object-cover" src={previewUrl} alt={fileName ?? 'selected'} />
          ) : (
            <div className="flex h-full min-h-52 items-center justify-center px-4 text-center text-sm text-ink/55 dark:text-white/55">
              PNG / JPEG / WEBP
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
