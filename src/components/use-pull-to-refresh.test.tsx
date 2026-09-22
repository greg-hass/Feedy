import assert from "node:assert/strict";
import { it } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { usePullToRefresh } from "./use-pull-to-refresh";

it("starts refresh after an 80px pull and ignores short or cancelled gestures", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = new Map(["window", "document", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "requestAnimationFrame", { value: () => 1, configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  let refreshes = 0;

  function Harness() {
    const { triggerDistance } = usePullToRefresh({
      isRefreshActive: false,
      onRefresh: () => { refreshes++; },
    });
    return <span>{triggerDistance}</span>;
  }

  const root = createRoot(dom.window.document.getElementById("root")!);
  const touch = (type: string, y?: number) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    if (y !== undefined) Object.defineProperty(event, "touches", { value: [{ clientY: y }] });
    dom.window.document.body.dispatchEvent(event);
  };

  try {
    await act(async () => root.render(<Harness />));
    assert.equal(dom.window.document.querySelector("span")?.textContent, "48");
    await act(async () => { touch("touchstart", 100); touch("touchmove", 150); touch("touchend"); });
    assert.equal(refreshes, 0);
    await act(async () => { touch("touchstart", 100); touch("touchmove", 180); touch("touchcancel"); });
    assert.equal(refreshes, 0);
    await act(async () => { touch("touchstart", 100); touch("touchmove", 180); touch("touchend"); });
    assert.equal(refreshes, 1);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
