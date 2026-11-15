import { action, makeObservable, observable, runInAction } from "mobx";

/** How many documents use a property, as far as the settings page knows. */
export type PropertyUsage =
  | { status: "known"; count: number }
  | { status: "counting" }
  | { status: "failed" };

/** The state of the definition list request that supplies usage counts. */
export type UsageListState = "loading" | "loaded" | "failed";

interface ResolveUsageInput {
  /** The count on the definition, which may be missing or out of date. */
  count: number | undefined;
  /** Whether the definition changed after the last successful list. */
  stale: boolean;
  /** The state of the latest list request made by the page. */
  list: UsageListState;
  /** Whether any list request, such as a realtime refetch, is in flight. */
  fetching: boolean;
}

/**
 * Decides whether a property's usage is known. A count only counts when the
 * latest list request succeeded after the definition last changed; anything
 * else is unknown, never zero.
 *
 * @param input the definition's count and the state of the list.
 * @returns the usage to show and to gate deletion on.
 */
export function resolvePropertyUsage({
  count,
  stale,
  list,
  fetching,
}: ResolveUsageInput): PropertyUsage {
  if (list === "loading" || fetching) {
    return { status: "counting" };
  }
  if (list === "failed" || stale || count === undefined) {
    return { status: "failed" };
  }
  return { status: "known", count };
}

/**
 * Tracks which usage counts can be trusted on the properties settings page.
 * Create and update responses carry no count, so the definitions they return
 * are marked stale until a list requested after the change succeeds.
 */
export class PropertyUsageTracker {
  /** The state of the latest list request. */
  @observable
  list: UsageListState = "loading";

  /** Stale definition IDs, mapped to the request that must succeed first. */
  private stale = observable.map<string, number>();

  private generation = 0;

  private fetchList: () => Promise<unknown>;

  /**
   * @param fetchList requests the definition list, starting after the call.
   */
  constructor(fetchList: () => Promise<unknown>) {
    this.fetchList = fetchList;
    makeObservable(this);
  }

  /**
   * Requests the list again. Rejects when the request fails, after the
   * tracker records the failure.
   *
   * @returns a promise that resolves when fresh counts are applied.
   */
  refresh = async (): Promise<void> => {
    const generation = this.start();
    try {
      await this.fetchList();
    } catch (err) {
      this.finish(generation, false);
      throw err;
    }
    this.finish(generation, true);
  };

  /**
   * Marks a definition's count as unknown, because a response without a
   * count changed it, and requests the list again.
   *
   * @param id the ID of the changed definition.
   * @returns a promise that resolves when fresh counts are applied.
   */
  invalidate = (id: string): Promise<void> => {
    runInAction(() => {
      this.stale.set(id, this.generation + 1);
    });
    return this.refresh();
  };

  /**
   * Returns the usage of a definition.
   *
   * @param definition the definition's ID and count.
   * @param definition.id the ID of the definition.
   * @param definition.affectedDocumentCount the count, when the API sent one.
   * @param fetching whether another list request is in flight.
   * @returns the usage to show and to gate deletion on.
   */
  usageOf(
    definition: { id: string; affectedDocumentCount?: number },
    fetching: boolean
  ): PropertyUsage {
    return resolvePropertyUsage({
      count: definition.affectedDocumentCount,
      stale: this.stale.has(definition.id),
      list: this.list,
      fetching,
    });
  }

  @action
  private start(): number {
    this.generation += 1;
    this.list = "loading";
    return this.generation;
  }

  @action
  private finish(generation: number, succeeded: boolean) {
    if (succeeded) {
      Array.from(this.stale.entries()).forEach(([id, required]) => {
        if (required <= generation) {
          this.stale.delete(id);
        }
      });
    }
    if (generation === this.generation) {
      this.list = succeeded ? "loaded" : "failed";
    }
  }
}
