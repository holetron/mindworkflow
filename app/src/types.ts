// Basic types for the application
export interface Node {
  id: string;
  type: string;
  title: string;
  content?: string;
  ai?: Record<string, unknown>;
  [key: string]: unknown;
}