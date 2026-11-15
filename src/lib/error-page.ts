import { LANGUAGE_STORAGE_KEY, myanmar, type TranslationKey } from "@/i18n/translations";

export function renderErrorPage(): string {
  const keys: TranslationKey[] = [
    "This page didn't load",
    "Something went wrong on our end. You can try refreshing or head back home.",
    "Try again",
    "Go home",
  ];
  const messages = JSON.stringify(keys.map((key) => myanmar[key])).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>MarsHab | Mars Mission Planning</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 data-error-message="0">This page didn't load</h1>
      <p data-error-message="1">Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button data-error-message="2" class="primary" onclick="location.reload()">Try again</button>
        <a data-error-message="3" class="secondary" href="/">Go home</a>
      </div>
    </div>
    <script>try { if (localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)}) === "my") {
      var messages = ${messages};
      document.documentElement.lang = "my";
      document.querySelectorAll("[data-error-message]").forEach(function (node) { node.textContent = messages[Number(node.dataset.errorMessage)]; });
    } } catch (_) { /* Keep readable English when storage is unavailable. */ }</script>
  </body>
</html>`;
}
