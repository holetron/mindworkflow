import React from 'react';
import type { FlowNode } from './nodeTypes';

interface PdfNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  autoRenameFromSource: (source: string | undefined | null) => void;
}

export function PdfNodeContent({ node, disabled, onChangeMeta, autoRenameFromSource }: PdfNodeContentProps) {
  const pdfUrl = node.meta?.pdf_url as string | undefined;
  const pdfData = node.meta?.pdf_data as string | undefined;
  const viewerSrc = pdfUrl || pdfData;

  return (
    <div className="flex flex-col h-full">
      {viewerSrc ? (
        <iframe
          src={viewerSrc}
          className="w-full flex-1 border-0"
          title="PDF Viewer"
          style={{ minHeight: '300px' }}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-center py-6 text-white/50 text-sm">
            {'\u{1F4C4}'} PDF Viewer
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const url = prompt('Enter PDF file URL:');
                if (url) {
                  onChangeMeta(node.node_id, { pdf_url: url, pdf_file: null, pdf_data: null });
                  autoRenameFromSource(url);
                }
              }}
              className="px-3 py-2 text-sm rounded bg-blue-600/30 text-blue-200 hover:bg-blue-600/50 transition"
            >
              {'\u{1F517}'} URL
            </button>
            <button
              type="button"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,application/pdf';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const data = event.target?.result as string;
                      onChangeMeta(node.node_id, { pdf_file: file.name, pdf_data: data, pdf_url: null });
                      autoRenameFromSource(file.name);
                    };
                    reader.readAsDataURL(file);
                  }
                };
                input.click();
              }}
              className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition"
            >
              {'\u{1F4C1}'} File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
