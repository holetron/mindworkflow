import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResizeHandle, clamp } from './ResizeHandle';

describe('ResizeHandle', () => {
  it('renders a vertical resize handle with separator role', () => {
    render(
      <ResizeHandle
        orientation="vertical"
        onResize={() => {}}
        ariaLabel="Resize sidebar"
      />,
    );
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(handle).toBeInTheDocument();
  });

  it('renders a horizontal resize handle', () => {
    render(
      <ResizeHandle
        orientation="horizontal"
        onResize={() => {}}
        ariaLabel="Resize panel"
      />,
    );
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(handle).toBeInTheDocument();
  });

  it('applies vertical cursor class for vertical orientation', () => {
    render(
      <ResizeHandle
        orientation="vertical"
        onResize={() => {}}
        ariaLabel="Vertical handle"
      />,
    );
    const handle = screen.getByRole('separator');
    expect(handle.className).toContain('cursor-ew-resize');
  });

  it('applies horizontal cursor class for horizontal orientation', () => {
    render(
      <ResizeHandle
        orientation="horizontal"
        onResize={() => {}}
        ariaLabel="Horizontal handle"
      />,
    );
    const handle = screen.getByRole('separator');
    expect(handle.className).toContain('cursor-ns-resize');
  });
});

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps to minimum', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamps to maximum', () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it('handles equal min and max', () => {
    expect(clamp(50, 42, 42)).toBe(42);
  });

  it('handles exact boundaries', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });
});
