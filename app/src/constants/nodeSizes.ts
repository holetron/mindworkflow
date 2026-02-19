/**
 * Constants for node sizing and layout
 * 
 * These constants define the fixed heights for different parts of a node
 * and constraints for content sizing.
 */

// ============================================================================
// Fixed Heights for Node Parts
// ============================================================================

/**
 * Header height - contains node title, type icon, and actions
 * Fixed at 40px in all modes
 */
export const NODE_HEADER_HEIGHT = 40;

/**
 * Toolbar height - contains mode switches, Load, Link buttons
 * Always visible, fixed at 24px in compact mode
 */
export const NODE_TOOLBAR_HEIGHT = 24;

/**
 * Footer height in normal mode
 * Contains metadata, localhost link, etc.
 */
export const NODE_FOOTER_HEIGHT_NORMAL = 40;

/**
 * Footer height in annotation mode
 * Slightly taller to accommodate Reset/Save buttons
 */
export const NODE_FOOTER_HEIGHT_ANNOTATION = 48;

/**
 * Annotation overlay height
 * Appears at bottom of content (position: absolute, bottom: 0)
 * Contains brush, eraser, color picker, line width slider
 */
export const ANNOTATION_OVERLAY_HEIGHT = 48;

// ============================================================================
// Total Fixed Heights (for calculations)
// ============================================================================

/**
 * Total fixed height in normal mode
 * = Header + Toolbar + Footer
 * = 40 + 44 + 40 = 124px
 */
export const TOTAL_FIXED_HEIGHT_NORMAL = 
  NODE_HEADER_HEIGHT + NODE_TOOLBAR_HEIGHT + NODE_FOOTER_HEIGHT_NORMAL;

/**
 * Total fixed height in annotation mode
 * = Header + Toolbar + Footer (annotation)
 * = 40 + 44 + 48 = 132px
 * 
 * Note: Annotation overlay is NOT included as it's positioned over content
 */
export const TOTAL_FIXED_HEIGHT_ANNOTATION = 
  NODE_HEADER_HEIGHT + NODE_TOOLBAR_HEIGHT + NODE_FOOTER_HEIGHT_ANNOTATION;

// ============================================================================
// Content Constraints
// ============================================================================

/**
 * Minimum content width
 * Ensures header/toolbar/footer are readable
 */
export const MIN_CONTENT_WIDTH = 200;

/**
 * Maximum content width
 * Prevents nodes from being too large for most screens
 */
export const MAX_CONTENT_WIDTH = 1200;

/**
 * Minimum content height
 * For image/video nodes
 */
export const MIN_CONTENT_HEIGHT = 200;

/**
 * Maximum content height
 * For image/video nodes
 */
export const MAX_CONTENT_HEIGHT = 800;

// ============================================================================
// Total Node Constraints
// ============================================================================

/**
 * Minimum total node width
 */
export const MIN_NODE_WIDTH = MIN_CONTENT_WIDTH;

/**
 * Maximum total node width
 */
export const MAX_NODE_WIDTH = MAX_CONTENT_WIDTH;

/**
 * Minimum total node height (normal mode)
 * = MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL
 * = 200 + 124 = 324px
 */
export const MIN_NODE_HEIGHT_NORMAL = MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL;

/**
 * Maximum total node height (normal mode)
 * = MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL
 * = 800 + 124 = 924px
 */
export const MAX_NODE_HEIGHT_NORMAL = MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_NORMAL;

/**
 * Minimum total node height (annotation mode)
 * = MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION
 * = 200 + 132 = 332px
 */
export const MIN_NODE_HEIGHT_ANNOTATION = MIN_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION;

/**
 * Maximum total node height (annotation mode)
 * = MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION
 * = 800 + 132 = 932px
 */
export const MAX_NODE_HEIGHT_ANNOTATION = MAX_CONTENT_HEIGHT + TOTAL_FIXED_HEIGHT_ANNOTATION;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate total node height from content height
 * @param contentHeight - Height of the content area
 * @param isAnnotationMode - Whether annotation mode is active
 * @returns Total node height including fixed parts
 */
export function calculateNodeHeight(contentHeight: number, isAnnotationMode: boolean): number {
  const fixedHeight = isAnnotationMode 
    ? TOTAL_FIXED_HEIGHT_ANNOTATION 
    : TOTAL_FIXED_HEIGHT_NORMAL;
  
  return contentHeight + fixedHeight;
}

/**
 * ✅ BUG-011 FIX: Calculate total image node dimensions including padding and border
 * @param displayWidth - Content display width (from scaleImageToFit)
 * @param displayHeight - Content display height (from scaleImageToFit)
 * @param isAnnotationMode - Whether annotation mode is active
 * @returns Total node width and height that should be set on the node
 */
export function calculateImageNodeDimensions(
  displayWidth: number,
  displayHeight: number,
  isAnnotationMode: boolean
): { width: number; height: number } {
  // CSS Constants - must match the actual CSS in FlowNodeCard
  const NODE_CONTENT_PADDING = 20;  // px - padding inside the node container
  const NODE_BORDER_WIDTH = 2;      // px - border thickness
  
  // Total fixed height (header + toolbar + footer)
  const fixedHeight = isAnnotationMode 
    ? TOTAL_FIXED_HEIGHT_ANNOTATION 
    : TOTAL_FIXED_HEIGHT_NORMAL;
  
  // Calculate total width: content + padding on both sides + border on both sides
  const totalWidth = displayWidth + (NODE_CONTENT_PADDING * 2) + (NODE_BORDER_WIDTH * 2);
  
  // Calculate total height: content + fixed parts + padding on top/bottom + border on both sides
  const totalHeight = displayHeight + fixedHeight + (NODE_CONTENT_PADDING * 2) + (NODE_BORDER_WIDTH * 2);
  
  // Get minimum height based on mode
  const minHeight = isAnnotationMode ? MIN_NODE_HEIGHT_ANNOTATION : MIN_NODE_HEIGHT_NORMAL;
  
  return {
    width: Math.max(totalWidth, MIN_NODE_WIDTH),
    height: Math.max(totalHeight, minHeight),
  };
}

/**
 * Calculate content height from total node height
 * @param nodeHeight - Total height of the node
 * @param isAnnotationMode - Whether annotation mode is active
 * @returns Height of the content area
 */
export function calculateContentHeight(nodeHeight: number, isAnnotationMode: boolean): number {
  const fixedHeight = isAnnotationMode 
    ? TOTAL_FIXED_HEIGHT_ANNOTATION 
    : TOTAL_FIXED_HEIGHT_NORMAL;
  
  return Math.max(0, nodeHeight - fixedHeight);
}

/**
 * Scale image dimensions to fit within max bounds while preserving aspect ratio
 * @param naturalWidth - Original width of the image
 * @param naturalHeight - Original height of the image
 * @returns Scaled dimensions and scale factor
 */
export function scaleImageToFit(
  naturalWidth: number, 
  naturalHeight: number
): { width: number; height: number; scale: number } {
  // Calculate scale factor needed to fit within max bounds
  const scale = Math.min(
    MAX_CONTENT_WIDTH / naturalWidth,
    MAX_CONTENT_HEIGHT / naturalHeight,
    1 // Don't scale up, only down
  );

  return {
    width: Math.max(naturalWidth * scale, MIN_CONTENT_WIDTH),
    height: naturalHeight * scale,
    scale,
  };
}

/**
 * Get footer height for current mode
 * @param isAnnotationMode - Whether annotation mode is active
 * @returns Footer height in pixels
 */
export function getFooterHeight(isAnnotationMode: boolean): number {
  return isAnnotationMode ? NODE_FOOTER_HEIGHT_ANNOTATION : NODE_FOOTER_HEIGHT_NORMAL;
}
