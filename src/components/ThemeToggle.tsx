import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  dark: boolean;
  onToggle: () => void;
}

export function ThemeToggle({ dark, onToggle }: ThemeToggleProps) {
  return (
    <button className="icon-button" type="button" onClick={onToggle} title={dark ? '浅色主题' : '深色主题'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
