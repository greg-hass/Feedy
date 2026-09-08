import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import {
  readTimelineAnchor,
  useScrollRestoration,
} from "./use-scroll-restoration";
import { getStoredLayoutMode, layoutModeStorageKey } from "../lib/layout";

test("invalid timeline anchors are ignored", () => {
  for (const value of [
    null,
    "{",
    "null",
    "[]",
    '{"scrollY":"780"}',
    '{"scrollY":1e999}',
  ]) {
    assert.equal(readTimelineAnchor(value), null);
  }
  assert.deepEqual(
    readTimelineAnchor('{"scrollY":-1,"itemId":"a","viewportTop":40}'),
    {
      itemId: "a",
      scrollY: 0,
      viewportTop: 40,
    },
  );
});

test("timeline restores on mount and Safari return without fighting subsequent swipes", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://feedy.test/app/unread",
  });
  const globals = ["window", "document", "IS_REACT_ACT_ENVIRONMENT"] as const;
  const descriptors = globals.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true,
  });
  let y = 0;
  let height = 4000;
  Object.defineProperty(dom.window, "scrollY", { get: () => y });
  Object.defineProperty(dom.window.document.documentElement, "scrollHeight", {
    get: () => height,
  });
  const scrolls: number[] = [];
  dom.window.scrollTo = (options: ScrollToOptions | number = {}) => {
    y = typeof options === "number" ? options : (options.top ?? 0);
    scrolls.push(y);
  };
  const root = createRoot(dom.window.document.getElementById("root")!);
  let hasNextPage = false;
  let fetches = 0;
  const fetchNextPage = async () => {
    fetches += 1;
  };
  function Harness() {
    useScrollRestoration({
      scrollStorageKey: "scroll",
      anchorStorageKey: "anchor",
      timelineFixedTop: 100,
      isItemsLoading: false,
      timelineItems: [{ id: "a" }],
      hasNextPage,
      fetchNextPage,
    });
    return null;
  }
  try {
    assert.equal(getStoredLayoutMode(), "flat");
    dom.window.localStorage.setItem(layoutModeStorageKey, "card");
    assert.equal(getStoredLayoutMode(), "card");
    dom.window.localStorage.setItem(layoutModeStorageKey, "invalid");
    assert.equal(getStoredLayoutMode(), "flat");

    dom.window.sessionStorage.setItem("anchor", '{"itemId":"a","scrollY":780}');
    await act(async () => root.render(createElement(Harness)));
    assert.equal(y, 780);
    assert.equal(dom.window.sessionStorage.getItem("anchor"), null);

    // A departing article's anchor must survive a late scroll event at zero.
    dom.window.sessionStorage.setItem(
      "anchor",
      '{"itemId":"a","scrollY":1200}',
    );
    y = 0;
    dom.window.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(dom.window.sessionStorage.getItem("scroll"), "780");
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
    });
    assert.equal(y, 1200);
    y = 100;
    const count = scrolls.length;
    dom.window.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(scrolls.length, count);
    assert.equal(dom.window.sessionStorage.getItem("scroll"), "100");

    // A full reload needs more pages before the saved position is reachable.
    height = 1000;
    hasNextPage = true;
    dom.window.sessionStorage.setItem("anchor", '{"scrollY":2400}');
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
    });
    assert.equal(fetches, 1);
    assert.notEqual(dom.window.sessionStorage.getItem("anchor"), null);
    height = 5000;
    hasNextPage = false;
    await act(async () => root.render(createElement(Harness)));
    assert.equal(y, 2400);
    assert.equal(dom.window.sessionStorage.getItem("anchor"), null);

    // Content above the article changed: retain its viewport position, not stale pixels.
    const article = dom.window.document.createElement("article");
    article.dataset.timelineItemId = "a";
    article.getBoundingClientRect = () => ({
      top: 600,
      bottom: 800,
      left: 0,
      right: 100,
      width: 100,
      height: 200,
      x: 0,
      y: 600,
      toJSON: () => ({}),
    });
    dom.window.document.body.append(article);
    dom.window.sessionStorage.setItem(
      "anchor",
      '{"itemId":"a","scrollY":2400,"viewportTop":200}',
    );
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("focus"));
    });
    assert.equal(y, 2800);
    article.remove();

    // End of list (or next-page failure) falls back without an endless retry.
    height = 1000;
    dom.window.sessionStorage.setItem("anchor", '{"scrollY":2400}');
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("pageshow"));
    });
    assert.equal(fetches, 1);
    assert.equal(dom.window.sessionStorage.getItem("anchor"), null);
  } finally {
    await act(async () => root.unmount());
    globals.forEach((key, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
    dom.window.close();
  }
});
