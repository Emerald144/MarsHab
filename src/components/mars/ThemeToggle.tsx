import { useLanguage } from "@/i18n/useLanguage";
import { Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/theme";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const { display } = useLanguage();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={display(label)}
      title={display(label)}
      className="btn-ghost inline-flex h-9 w-9 items-center justify-center"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
