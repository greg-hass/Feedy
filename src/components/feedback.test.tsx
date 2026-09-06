import assert from "node:assert/strict";
import { it } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { FeedAvatar } from "./feed-avatar";
import { TimelineRefreshToast } from "./timeline-refresh-toast";

it("falls back from a discovered icon to the cached icon and then the feed initial", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://feedy.test" });
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<FeedAvatar feedId="feed-1" title="Example" iconHintUrl="https://example.com/icon.png" />));
    assert.equal(container.querySelector("img")?.getAttribute("src"), "https://example.com/icon.png");
    await act(async () => { container.querySelector("img")!.dispatchEvent(new dom.window.Event("error")); });
    assert.equal(new URL(container.querySelector("img")!.src).pathname, "/api/icons/feed-1");
    await act(async () => { container.querySelector("img")!.dispatchEvent(new dom.window.Event("error")); });
    assert.equal(container.querySelector("img"), null);
    assert.equal(container.textContent, "E");
  } finally {
    await act(async () => root.unmount());
    keys.forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key));
    dom.window.close();
  }
});

it("announces new articles, jumps on click, and dismisses with the latest callback while cleaning up timers", async () => {
  const dom = new JSDOM('<button id="focus">Existing focus</button><div id="root"></div>');
  const keys = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const previous = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const timers = new Map<number, { callback: () => void; delay: number | undefined }>();
  let nextId = 0;
  dom.window.setTimeout = ((callback: () => void, delay?: number) => {
    timers.set(++nextId, { callback, delay });
    return nextId;
  }) as typeof dom.window.setTimeout;
  dom.window.clearTimeout = (id?: number) => { timers.delete(id!); };
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  let jumps = 0;
  let oldDismissals = 0;
  let dismissals = 0;
  const onJump = () => { jumps++; };
  const onDismiss = () => { dismissals++; };
  try {
    const focus = dom.window.document.getElementById("focus")!;
    focus.focus();
    await act(async () => root.render(<TimelineRefreshToast count={3} onJump={onJump} onDismiss={() => { oldDismissals++; }} />));
    assert.equal(dom.window.document.activeElement, focus);
    assert.ok(container.querySelector('[aria-live="polite"]'));
    assert.match(container.querySelector("button")!.getAttribute("aria-label")!, /3/);
    await act(async () => { container.querySelector("button")!.click(); });
    assert.equal(jumps, 1);
    assert.equal(timers.size, 1);
    const timer = [...timers.values()][0];
    assert.equal(timer.delay, 5000);
    await act(async () => root.render(<TimelineRefreshToast count={3} onJump={onJump} onDismiss={onDismiss} />));
    await act(async () => timer.callback());
    assert.equal(oldDismissals, 0);
    assert.equal(dismissals, 1);
    await act(async () => root.render(<TimelineRefreshToast count={0} onJump={onJump} onDismiss={onDismiss} />));
    assert.equal(container.textContent, "");
    assert.equal(timers.size, 0);
    await act(async () => root.render(<TimelineRefreshToast count={1} onJump={onJump} onDismiss={onDismiss} />));
    assert.equal(timers.size, 1);
  } finally {
    await act(async () => root.unmount());
    assert.equal(timers.size, 0);
    keys.forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]!) : Reflect.deleteProperty(globalThis, key));
    dom.window.close();
  }
});
