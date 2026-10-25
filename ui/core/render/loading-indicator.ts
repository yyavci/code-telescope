import { LoadingStateMessage } from "../../../shared/extension-webview-protocol";

type LoadScope = LoadingStateMessage["scope"];

/**
 * Thin progress bar shown while the backend loads options: the initial list or a dynamic search.
 * Each load is tracked by its id, so a stale load finishing late cannot hide the bar of a newer one.
 * The bar appears after a short delay so finders that answer quickly never flash it.
 */
export class LoadingIndicator {
  private static _instance: LoadingIndicator | undefined;

  private static readonly SHOW_DELAY_MS = 150;
  private static readonly ACTIVE_CLASS = "active";

  /** Missing in custom layouts that do not include it, which simply disables the bar. */
  private readonly element = document.getElementById("loading-bar");
  private readonly activeLoads = new Map<string, LoadScope>();
  private showTimer: ReturnType<typeof setTimeout> | undefined;

  static get instance() {
    if (!this._instance) {
      this._instance = new LoadingIndicator();
    }
    return this._instance;
  }

  setLoading(loading: boolean, scope: LoadScope, id: string): void {
    if (loading) {
      this.activeLoads.set(id, scope);
    } else {
      this.activeLoads.delete(id);
    }
    this.update();
  }

  /**
   * Forgets every running search when a newer one is requested. An aborted search the provider
   * cannot cancel only ends when it answers, which would otherwise keep the bar on, e.g. after the
   * input is cleared and no newer search starts.
   */
  endSearches(): void {
    for (const [id, scope] of this.activeLoads) {
      if (scope === "search") this.activeLoads.delete(id);
    }
    this.update();
  }

  private update(): void {
    if (this.activeLoads.size === 0) {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
      this.element?.classList.remove(LoadingIndicator.ACTIVE_CLASS);
      return;
    }

    const isShownOrPending =
      this.showTimer !== undefined || this.element?.classList.contains(LoadingIndicator.ACTIVE_CLASS);
    if (isShownOrPending) return;

    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.element?.classList.add(LoadingIndicator.ACTIVE_CLASS);
    }, LoadingIndicator.SHOW_DELAY_MS);
  }
}
