// Optional real-Chrome check. Start a fresh headless Chrome with CDP on 9337.
// Uses Node's built-in fetch/WebSocket; no browser or application dependencies.
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const tabs = await fetch("http://127.0.0.1:9337/json/list").then((r) => r.json());
for (const tab of tabs.filter(
  (tab) => tab.type === "page" && tab.url === "http://127.0.0.1:8080/mission",
))
  await fetch("http://127.0.0.1:9337/json/close/" + tab.id);
const target = await fetch("http://127.0.0.1:9337/json/new?about:blank", { method: "PUT" }).then(
  (r) => r.json(),
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      clearTimeout(item.timeout);
      message.error
        ? item.reject(new Error(JSON.stringify(message.error)))
        : item.resolve(message.result);
    }
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(
      () => {
        pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      },
      method === "Page.navigate" ? 90000 : 30000,
    );
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails)
    throw new Error(
      response.exceptionDetails.text + " " + response.exceptionDetails.exception?.description,
    );
  return response.result.value;
}
async function wait(expression) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Browser condition timed out: " + expression);
}
async function click(label) {
  console.log("browser: click", label);
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent.trim() === ${JSON.stringify(label)}).click()`,
  );
}
const viewport = { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false };
const output = join(tmpdir(), "mars-explorer-check-" + Date.now());
await mkdir(output, { recursive: true });
const svgQuery = `document.querySelector('svg[aria-label="Real Jezero Crater terrain map"]')`;
const view = () => evaluate(`${svgQuery}.getAttribute('viewBox')`);
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(join(output, name + ".png"), Buffer.from(result.data, "base64"));
}
try {
  await send("Page.enable");
  await send("Runtime.enable");
  // The unrelated overview globe can stall software WebGL in headless Chrome.
  // Exercise the real SVG map using the application's existing no-WebGL fallback.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "const originalContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : originalContext.call(this, type, ...args); };",
  });
  console.log("browser: navigation");
  await send("Emulation.setDeviceMetricsOverride", viewport);
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  if (target.url !== "http://127.0.0.1:8080/mission")
    await send("Page.navigate", { url: "http://127.0.0.1:8080/mission" });
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Survival Map'))`,
  );
  // Server-rendered buttons appear before React has hydrated their handlers.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Survival Map')).click()`,
  );
  await wait(
    `(() => { if (${svgQuery}) return true; document.querySelector('button[aria-label="Survival Map"]')?.click(); return false; })()`,
  );
  console.log("browser: map ready");
  await wait(`!!document.querySelector('input[aria-label="CTX + hillshade"]')`);
  await evaluate(`document.querySelector('input[aria-label="CTX + hillshade"]').click()`);
  await wait(`!!document.querySelector('image[data-layer="ctx"]')`);
  const start = await view();
  await click("Zoom in");
  await wait(`${svgQuery}.getAttribute('viewBox') !== ${JSON.stringify(start)}`);
  await click("Fit map");
  const initial = await view();
  const point = await evaluate(
    `(() => {const r=${svgQuery}.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...point,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x + 60,
    y: point.y + 40,
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x + 60,
    y: point.y + 40,
    button: "left",
    clickCount: 1,
  });
  assert.notEqual(await view(), initial, "actual pointer drag must pan");
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Inspect terrain zone JZ-06"]').getAttribute('aria-pressed')`,
    ),
    "false",
    "drag must not select a zone",
  );
  await click("Fit imagery");
  await wait(`${svgQuery}.getAttribute('viewBox') !== ${JSON.stringify(initial)}`);
  await evaluate(`document.querySelector('[aria-label="Inspect terrain zone JZ-06"]').focus()`);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await wait(`!!document.querySelector('section[aria-label="Zone Details"]')`);
  await new Promise((resolve) => setTimeout(resolve, 800));
  const desktop = await evaluate(
    `(() => {const m=${svgQuery}.getBoundingClientRect(), p=document.querySelector('section[aria-label="Zone Details"]').getBoundingClientRect(); return {mapRight:m.right,detailsLeft:p.left,overflow:document.documentElement.scrollWidth>innerWidth};})()`,
  );
  assert.ok(desktop.detailsLeft >= desktop.mapRight, "desktop details must not cover the map");
  assert.equal(desktop.overflow, false);
  await screenshot("desktop");
  await click("Collapse zone details");
  assert.equal(
    await evaluate(
      `document.querySelector('[aria-label="Inspect terrain zone JZ-06"]').getAttribute('aria-pressed')`,
    ),
    "true",
  );
  await click("Zone Details");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await wait(`!document.querySelector('aside[aria-label="Layers"]')`);
  await click("Layers");
  await wait(`!!document.querySelector('[role="dialog"]')`);
  await screenshot("mobile-layers");
  assert.equal(
    await evaluate(
      `!!document.querySelector('input[aria-label="Resources"],input[aria-label="Science targets"]')`,
    ),
    false,
  );
  await click("Close layers");
  await click("Fit imagery");
  await new Promise((resolve) => setTimeout(resolve, 600));
  const mobile = await evaluate(
    `(() => {const m=${svgQuery}.getBoundingClientRect(), p=document.querySelector('section[aria-label="Zone Details"]').getBoundingClientRect(); return {mapBottom:m.bottom,detailsTop:p.top,overflow:document.documentElement.scrollWidth>innerWidth};})()`,
  );
  assert.ok(mobile.detailsTop >= mobile.mapBottom, "mobile details must stack below the viewport");
  assert.equal(mobile.overflow, false);
  await screenshot("mobile");
  await evaluate(
    `document.querySelector('button[lang="my"]')?.click() || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('မြန်မာ')).click()`,
  );
  await wait(`document.querySelector('h2')?.textContent.includes('စူးစမ်း')`);
  await screenshot("mobile-myanmar");
  await evaluate(`document.querySelector('[aria-label="ချဲ့ရန်"]').click()`);
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='ဦးတည်ရာအဖြစ် ရွေးရန်').click()`,
  );
  await wait(
    `!!document.querySelector('input[aria-label="${"မစ်ရှင်အမည်"}"]') || !document.querySelector('h2')?.textContent.includes('စူးစမ်း')`,
  );
  console.log(JSON.stringify({ result: "passed", desktop, mobile, screenshots: output }));
} catch (error) {
  await screenshot("failure").catch(() => {});
  console.error(error.message, "Screenshots:", output);
  process.exitCode = 1;
} finally {
  socket.close();
}
