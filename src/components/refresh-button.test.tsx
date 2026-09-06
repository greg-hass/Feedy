import assert from "node:assert/strict";
import { it } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { useRefreshController } from "./refresh-button";

it("does not reload the timeline on renders or unfinished status polls, and reloads once on completion", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = new Map(["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let timelineRequests = 0;
  let start: () => void = () => {};
  let active = false;
  let status = { active: 2, completed: 0, total: 2, failed: 0, running: 2, queued: 0, succeeded: 0 };
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("status") ? status : { batchId: "batch-1", totalFeeds: 2, queued: 2, skipped: 0 }), { headers: { "content-type": "application/json" } });
  function Harness({ tick }: { tick: number }) {
    const items = useQuery({ queryKey: ["items"], queryFn: async () => { timelineRequests++; await new Promise(resolve => setTimeout(resolve, 5)); return ["article"]; } });
    const refresh = useRefreshController("/api/refresh/all", "items");
    start = refresh.start;
    active = refresh.active;
    return <div>{tick}:{String(items.isFetching)}:{refresh.phase}</div>;
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (tick: number) => act(async () => root.render(<QueryClientProvider client={client}><Harness tick={tick} /></QueryClientProvider>));
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  try {
    await render(0);
    await settle();
    const initial = timelineRequests;
    await act(async () => start());
    await settle();
    for (let tick = 1; tick <= 20; tick++) { await render(tick); await settle(); }
    const duringRefresh = timelineRequests - initial;
    console.log(JSON.stringify({ unrelatedRenders: 20, timelineReloadsDuringRefresh: duringRefresh }));
    assert.equal(duringRefresh, 0);
    status = { ...status, completed: 1, active: 1, succeeded: 1, running: 1 };
    await act(async () => { await client.refetchQueries({ queryKey: ["refresh-status"] }); });
    await settle();
    assert.equal(timelineRequests, initial);
    status = { ...status, completed: 2, active: 0, succeeded: 2, running: 0 };
    await act(async () => { await client.refetchQueries({ queryKey: ["refresh-status"] }); });
    await settle();
    assert.equal(timelineRequests, initial + 1);
    for (let tick = 21; tick <= 25; tick++) { await render(tick); await settle(); }
    assert.equal(timelineRequests, initial + 1);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1600)); });
    await settle();
    assert.equal(active, false);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
