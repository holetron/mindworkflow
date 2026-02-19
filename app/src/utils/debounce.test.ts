import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call function immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls function after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to the debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('hello', 42);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('hello', 42);
  });

  it('resets the timer on rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // reset timer
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled(); // only 50ms since last call

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce(); // 100ms since last call
  });

  it('only calls with the latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('can be called again after the delay fires', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('call-1');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();

    debounced('call-2');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('call-2');
  });

  it('handles zero delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);
    debounced();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledOnce();
  });
});
