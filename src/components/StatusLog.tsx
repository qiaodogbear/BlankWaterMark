import { ListChecks } from 'lucide-react';

interface StatusLogProps {
  logs: string[];
}

export function StatusLog({ logs }: StatusLogProps) {
  return (
    <section className="panel rounded-md p-4">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks size={18} />
        <h2 className="font-semibold">状态日志</h2>
      </div>
      <div className="max-h-52 space-y-2 overflow-auto text-sm">
        {logs.length ? (
          logs.map((log, index) => (
            <div key={`${log}-${index}`} className="rounded-md bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
              {log}
            </div>
          ))
        ) : (
          <div className="rounded-md bg-black/[0.04] px-3 py-2 text-ink/60 dark:bg-white/[0.06] dark:text-white/60">
            等待操作
          </div>
        )}
      </div>
    </section>
  );
}
