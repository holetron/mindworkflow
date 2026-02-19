import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the version constant before importing the component
vi.mock('../constants/version', () => ({
  APP_VERSION: '1.2.3',
}));

import { VersionBadge } from './VersionBadge';

describe('VersionBadge', () => {
  it('renders the version with "v" prefix', () => {
    render(<VersionBadge />);
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('renders as a span element', () => {
    render(<VersionBadge />);
    const badge = screen.getByText('v1.2.3');
    expect(badge.tagName).toBe('SPAN');
  });

  it('has pointer-events-none class by default', () => {
    render(<VersionBadge />);
    const badge = screen.getByText('v1.2.3');
    expect(badge.className).toContain('pointer-events-none');
  });

  it('applies additional className when provided', () => {
    render(<VersionBadge className="extra-class" />);
    const badge = screen.getByText('v1.2.3');
    expect(badge.className).toContain('extra-class');
  });

  it('has select-none class to prevent text selection', () => {
    render(<VersionBadge />);
    const badge = screen.getByText('v1.2.3');
    expect(badge.className).toContain('select-none');
  });

  it('includes opacity class', () => {
    render(<VersionBadge />);
    const badge = screen.getByText('v1.2.3');
    expect(badge.className).toContain('opacity-80');
  });

  it('merges className correctly without undefined', () => {
    render(<VersionBadge />);
    const badge = screen.getByText('v1.2.3');
    // No "undefined" in the class string
    expect(badge.className).not.toContain('undefined');
  });
});
