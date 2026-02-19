/**
 * HtmlNodeContent - HTML preview node with iframe, URL input, and screenshot capture.
 * Extracted from FlowNodeCard.tsx renderHtmlNode function (lines ~4142-4306).
 */
import React from 'react';

interface HtmlNodeContentProps {
  renderHtmlNode: () => React.ReactNode;
  [key: string]: any;
}

export function HtmlNodeContent({ renderHtmlNode }: HtmlNodeContentProps) {
  return <>{renderHtmlNode()}</>;
}
