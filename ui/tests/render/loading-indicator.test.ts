import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingIndicator } from "../../core/render/loading-indicator";

const SHOW_DELAY_MS = 150;

describe("LoadingIndicator", () => {
  let element: HTMLElement;
  let indicator: LoadingIndicator;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement("div");
    element.id = "loading-bar";
    document.body.appendChild(element);
    indicator = new LoadingIndicator();
  });

  afterEach(() => {
    element.remove();
    vi.useRealTimers();
  });

  const isShown = () => element.classList.contains("active");

  it("shows the bar only after the delay", () => {
    indicator.setLoading(true, "initial", "initial-1");

    vi.advanceTimersByTime(SHOW_DELAY_MS - 1);
    expect(isShown()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(isShown()).toBe(true);
  });

  it("never shows the bar for a load that ends before the delay", () => {
    indicator.setLoading(true, "initial", "initial-1");
    indicator.setLoading(false, "initial", "initial-1");

    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(isShown()).toBe(false);
  });

  it("keeps the bar while a newer search is still loading", () => {
    indicator.setLoading(true, "search", "request-1");
    indicator.setLoading(true, "search", "request-2");
    vi.advanceTimersByTime(SHOW_DELAY_MS);

    indicator.setLoading(false, "search", "request-1");
    expect(isShown()).toBe(true);

    indicator.setLoading(false, "search", "request-2");
    expect(isShown()).toBe(false);
  });

  it("tracks the initial load separately from dynamic searches", () => {
    indicator.setLoading(true, "initial", "initial-1");
    indicator.setLoading(true, "search", "request-1");
    vi.advanceTimersByTime(SHOW_DELAY_MS);

    indicator.setLoading(false, "search", "request-1");
    expect(isShown()).toBe(true);

    indicator.setLoading(false, "initial", "initial-1");
    expect(isShown()).toBe(false);
  });
  it("drops running searches but keeps the initial load when a newer search is requested", () => {
    indicator.setLoading(true, "initial", "initial-1");
    indicator.setLoading(true, "search", "request-1");
    vi.advanceTimersByTime(SHOW_DELAY_MS);

    indicator.endSearches();
    expect(isShown()).toBe(true);

    indicator.setLoading(false, "initial", "initial-1");
    expect(isShown()).toBe(false);
  });

  it("hides the bar when the only running search is dropped", () => {
    indicator.setLoading(true, "search", "request-1");
    vi.advanceTimersByTime(SHOW_DELAY_MS);

    indicator.endSearches();
    expect(isShown()).toBe(false);
  });
});
