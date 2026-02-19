import React from 'react';
import type { FlowNode } from './nodeTypes';

interface TableNodeContentProps {
  node: FlowNode;
  disabled: boolean;
  onChangeMeta: (nodeId: string, metaPatch: Record<string, unknown>) => void;
  autoRenameFromSource: (source: string | undefined | null) => void;
  contentValue: string;
  handleContentChange: (content: string) => void;
}

export function TableNodeContent({
  node,
  disabled,
  onChangeMeta,
  autoRenameFromSource,
  contentValue,
  handleContentChange,
}: TableNodeContentProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      {/* Upload/URL/Download buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,text/csv';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  const csvData = event.target?.result as string;
                  onChangeMeta(node.node_id, {
                    csv_file: file.name,
                    csv_data: csvData,
                    file_size: file.size,
                    file_type: file.type,
                    csv_url: '',
                    current_page: 1,
                  });
                  autoRenameFromSource(file.name);
                };
                reader.readAsText(file);
              }
            };
            input.click();
          }}
          className="px-3 py-2 text-sm rounded bg-green-600/30 text-green-200 hover:bg-green-600/50 transition"
          disabled={disabled}
        >
          {'\u{1F4CA}'} Upload CSV
        </button>
        <button
          type="button"
          onClick={() => {
            if (!contentValue) return;
            const blob = new Blob([contentValue], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${node.title || 'table'}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-3 py-2 text-sm rounded bg-blue-600/30 text-blue-200 hover:bg-blue-600/50 transition"
          disabled={disabled || !contentValue}
        >
          {'\u2B07\uFE0F'} Download
        </button>
      </div>

      {/* Table display */}
      <div className="flex-1 min-h-0 overflow-auto">
        {contentValue ? (
          <table className="w-full text-xs text-white/80 border-collapse">
            <tbody>
              {contentValue.split('\n').filter(Boolean).map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? 'font-semibold bg-white/10' : 'hover:bg-white/5'}>
                  {row.split(',').map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-white/10 px-2 py-1 truncate max-w-[200px]">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-white/50 text-sm">
            Upload a CSV file to see the table
          </div>
        )}
      </div>
    </div>
  );
}
