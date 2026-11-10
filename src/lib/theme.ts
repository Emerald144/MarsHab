import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "martian-map-theme";

export function useTheme() {
  // SSR နှင့် ကိုက်ညီစေရန် အမြဲ "dark" ဖြင့်စပါ
  const [theme, setTheme] = useState<Theme>("dark");

  // ၁။ ယခင်ရွေးထားသည်ကို browser ပေါ်မှ ဖတ် (render အတွင်း မဖတ်ရ၊ hydration error ဖြစ်နိုင်)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      // localStorage သုံးမရလျှင် လျစ်လျူရှု
    }
  }, []);

  // ၂။ theme ပြောင်းတိုင်း <html data-theme="..."> ကို update
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ၃။ ဤ component ပျောက်သွားလျှင် (Landing သို့ပြန်) attribute ဖယ်၊ Landing က Dark ဖြစ်စေရန်
  useEffect(() => {
    return () => document.documentElement.removeAttribute("data-theme");
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // လျစ်လျူရှု
    }
  }, [theme]);

  return { theme, toggle };
}