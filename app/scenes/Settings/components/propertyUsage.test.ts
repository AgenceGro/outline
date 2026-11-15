import { PropertyUsageTracker, resolvePropertyUsage } from "./propertyUsage";

/** A list request the test resolves or rejects by hand. */
const deferredList = () => {
  const calls: { resolve: () => void; reject: (err: Error) => void }[] = [];
  const fetchList = () =>
    new Promise<void>((resolve, reject) => {
      calls.push({ resolve, reject });
    });
  return { calls, fetchList };
};

describe("resolvePropertyUsage", () => {
  const base = { stale: false, list: "loaded" as const, fetching: false };

  it("knows the count only after a successful list", () => {
    expect(resolvePropertyUsage({ ...base, count: 12 })).toEqual({
      status: "known",
      count: 12,
    });
    expect(resolvePropertyUsage({ ...base, count: 0 })).toEqual({
      status: "known",
      count: 0,
    });
  });

  it("never treats a missing count as zero", () => {
    expect(resolvePropertyUsage({ ...base, count: undefined })).toEqual({
      status: "failed",
    });
  });

  it("is counting while any list request is in flight", () => {
    expect(
      resolvePropertyUsage({ ...base, count: 12, list: "loading" })
    ).toEqual({ status: "counting" });
    expect(
      resolvePropertyUsage({ ...base, count: 12, fetching: true })
    ).toEqual({ status: "counting" });
  });

  it("distrusts stale counts and failed lists", () => {
    expect(resolvePropertyUsage({ ...base, count: 12, stale: true })).toEqual({
      status: "failed",
    });
    expect(
      resolvePropertyUsage({ ...base, count: 12, list: "failed" })
    ).toEqual({ status: "failed" });
  });
});

describe("PropertyUsageTracker", () => {
  const definition = { id: "a", affectedDocumentCount: 4 };

  it("is counting until the first list arrives", async () => {
    const { calls, fetchList } = deferredList();
    const tracker = new PropertyUsageTracker(fetchList);
    expect(tracker.usageOf(definition, false)).toEqual({ status: "counting" });

    const refresh = tracker.refresh();
    calls[0].resolve();
    await refresh;
    expect(tracker.usageOf(definition, false)).toEqual({
      status: "known",
      count: 4,
    });
  });

  it("keeps a changed definition unknown until a later list succeeds", async () => {
    const { calls, fetchList } = deferredList();
    const tracker = new PropertyUsageTracker(fetchList);
    const first = tracker.refresh();
    calls[0].resolve();
    await first;

    const refetch = tracker.invalidate("a");
    expect(tracker.usageOf(definition, false)).toEqual({ status: "counting" });
    calls[1].resolve();
    await refetch;
    expect(tracker.usageOf(definition, false)).toEqual({
      status: "known",
      count: 4,
    });
  });

  it("does not let an older list clear a newer change", async () => {
    const { calls, fetchList } = deferredList();
    const tracker = new PropertyUsageTracker(fetchList);
    const older = tracker.refresh();
    const newer = tracker.invalidate("a");
    calls[0].resolve();
    await older;
    expect(tracker.usageOf(definition, false).status).not.toEqual("known");

    calls[1].resolve();
    await newer;
    expect(tracker.usageOf(definition, false)).toEqual({
      status: "known",
      count: 4,
    });
  });

  it("stays unknown after a failed list, and while retrying", async () => {
    const { calls, fetchList } = deferredList();
    const tracker = new PropertyUsageTracker(fetchList);
    const failing = tracker.invalidate("a");
    calls[0].reject(new Error("Offline"));
    await expect(failing).rejects.toThrow("Offline");
    expect(tracker.list).toEqual("failed");
    expect(tracker.usageOf(definition, false)).toEqual({ status: "failed" });

    const retry = tracker.refresh();
    expect(tracker.usageOf(definition, false)).toEqual({ status: "counting" });
    calls[1].resolve();
    await retry;
    expect(tracker.usageOf(definition, false)).toEqual({
      status: "known",
      count: 4,
    });
  });
});
