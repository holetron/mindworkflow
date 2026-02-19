/**
 * NodeContentBody - Dispatches the correct content renderer based on node type.
 * This component extracts the massive content area JSX from FlowNodeCard.
 */
import React from 'react';
import { AiNodeContent } from './AiNodeContent';
import { HtmlEditorContent } from './HtmlEditorContent';
import { HtmlNodeContent } from './HtmlNodeContent';
import { ImageNodeContent } from './ImageNodeContent';
import { VideoNodeContent } from './VideoNodeContent';
import { FolderNodeContent } from './FolderNodeContent';
import { FileNodeContent } from './FileNodeContent';
import { PdfNodeContent } from './PdfNodeContent';
import { TextNodeContent } from './TextNodeContent';
import { TableNodeContent } from './TableNodeContent';
import { DefaultNodeContent } from './DefaultNodeContent';
import type { FlowNode } from './nodeTypes';

export interface NodeContentBodyProps {
  node: FlowNode;
  disabled: boolean;
  collapsed: boolean;
  isImprovedAiNode: boolean;
  isTextualNode: boolean;
  // Content editing
  contentValue: string;
  contentInputRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  handleContentChange: (content: string) => void;
  startContentEditing: (source?: any) => void;
  finishContentEditing: () => void;
  contentFontSizeStyle?: string;
  // All handler/state props passed through
  allProps: Record<string, any>;
}

export function NodeContentBody({
  node,
  disabled,
  collapsed,
  isImprovedAiNode,
  isTextualNode,
  contentValue,
  contentInputRef,
  handleContentChange,
  startContentEditing,
  finishContentEditing,
  contentFontSizeStyle,
  allProps,
}: NodeContentBodyProps) {
  if (isImprovedAiNode) {
    return (
      <AiNodeContent
        node={node}
        disabled={disabled}
        collapsed={collapsed}
        contentValue={contentValue}
        contentInputRef={contentInputRef}
        handleContentChange={handleContentChange}
        startContentEditing={startContentEditing}
        finishContentEditing={finishContentEditing}
        contentFontSizeStyle={contentFontSizeStyle}
        {...allProps}
      />
    );
  }

  if (collapsed) return null;

  switch (node.type) {
    case 'html_editor':
      return (
        <HtmlEditorContent
          node={node}
          disabled={disabled}
          contentValue={contentValue}
          contentInputRef={contentInputRef}
          handleContentChange={handleContentChange}
          startContentEditing={startContentEditing}
          finishContentEditing={finishContentEditing}
          onChangeMeta={allProps.onChangeMeta}
        />
      );
    case 'html':
      return <HtmlNodeContent {...allProps} />;
    case 'image':
      return <ImageNodeContent node={node} disabled={disabled} {...allProps} />;
    case 'video':
      return <VideoNodeContent node={node} disabled={disabled} {...allProps} />;
    case 'folder':
      return <FolderNodeContent node={node} disabled={disabled} {...allProps} />;
    case 'file':
      return <FileNodeContent node={node} disabled={disabled} {...allProps} />;
    case 'pdf':
      return <PdfNodeContent node={node} disabled={disabled} onChangeMeta={allProps.onChangeMeta} autoRenameFromSource={allProps.autoRenameFromSource} />;
    case 'table':
      return <TableNodeContent node={node} disabled={disabled} onChangeMeta={allProps.onChangeMeta} autoRenameFromSource={allProps.autoRenameFromSource} contentValue={contentValue} handleContentChange={handleContentChange} />;
    default:
      if (isTextualNode) {
        return (
          <TextNodeContent
            node={node}
            disabled={disabled}
            contentValue={contentValue}
            contentInputRef={contentInputRef}
            handleContentChange={handleContentChange}
            startContentEditing={startContentEditing}
            finishContentEditing={finishContentEditing}
            contentFontSizeStyle={contentFontSizeStyle}
            {...allProps}
          />
        );
      }
      return (
        <DefaultNodeContent
          contentValue={contentValue}
          contentInputRef={contentInputRef}
          handleContentChange={handleContentChange}
          startContentEditing={startContentEditing}
          finishContentEditing={finishContentEditing}
          disabled={disabled}
          contentFontSizeStyle={contentFontSizeStyle}
        />
      );
  }
}
