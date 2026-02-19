// Advanced routing system for AI agents
// Allows multiple output types and custom routing configurations

export type OutputType = 
  | 'text' 
  | 'json' 
  | 'markdown' 
  | 'html' 
  | 'code' 
  | 'yaml'
  | 'xml'
  | 'csv';

export interface OutputRoute {
  id: string;
  type: OutputType;
  label: string;
  description?: string;
  contentType: string;
  enabled: boolean;
  // Routing rules
  conditions?: {
    // When to use this output route
    contains?: string[];
    matches?: RegExp;
    length?: { min?: number; max?: number };
    custom?: string; // Custom evaluation expression
  };
  // Post-processing
  transform?: {
    template?: string; // Template for formatting output
    format?: 'uppercase' | 'lowercase' | 'title' | 'sentence';
    sanitize?: boolean;
    maxLength?: number;
  };
}

export interface AgentRoutingConfig {
  // Multiple outputs configuration
  outputs: OutputRoute[];
  
  // Default routing behavior
  defaultOutput: string; // Route ID to use as default
  
  // Auto-routing based on content analysis
  autoRouting: {
    enabled: boolean;
    // Smart routing rules
    rules: {
      // Route JSON responses to json output
      detectJson: boolean;
      // Route code blocks to code output  
      detectCode: boolean;
      // Route markdown to markdown output
      detectMarkdown: boolean;
      // Route HTML to html output
      detectHtml: boolean;
    };
  };
  
  // Multiple simultaneous outputs
  multiOutput: {
    enabled: boolean;
    // Generate multiple formats simultaneously
    formats: OutputType[];
  };
  
  // Custom routing logic
  customRouting?: {
    enabled: boolean;
    script?: string; // JavaScript function for custom routing
  };
}

// Default routing configurations for different agent types
export const DEFAULT_ROUTING_CONFIGS: Record<string, AgentRoutingConfig> = {
  // Universal agent - supports all output types
  universal: {
    outputs: [
      {
        id: 'text',
        type: 'text',
        label: 'Text',
        contentType: 'text/plain',
        enabled: true,
        description: 'Plain text response'
      },
      {
        id: 'markdown',
        type: 'markdown',
        label: 'Markdown',
        contentType: 'text/markdown',
        enabled: true,
        description: 'Formatted markdown text'
      },
      {
        id: 'json',
        type: 'json',
        label: 'JSON',
        contentType: 'application/json',
        enabled: true,
        description: 'Structured JSON data'
      },
      {
        id: 'html',
        type: 'html',
        label: 'HTML',
        contentType: 'text/html',
        enabled: false,
        description: 'HTML markup'
      },
      {
        id: 'code',
        type: 'code',
        label: 'Code',
        contentType: 'text/plain',
        enabled: false,
        description: 'Program code'
      }
    ],
    defaultOutput: 'text',
    autoRouting: {
      enabled: true,
      rules: {
        detectJson: true,
        detectCode: true,
        detectMarkdown: true,
        detectHtml: false
      }
    },
    multiOutput: {
      enabled: false,
      formats: []
    }
  },
  
  // Coding assistant - focuses on code outputs
  coding: {
    outputs: [
      {
        id: 'code',
        type: 'code',
        label: 'Code',
        contentType: 'text/plain',
        enabled: true,
        description: 'Code with syntax highlighting'
      },
      {
        id: 'markdown',
        type: 'markdown',
        label: 'Documentation',
        contentType: 'text/markdown',
        enabled: true,
        description: 'Documentation in markdown'
      },
      {
        id: 'json',
        type: 'json',
        label: 'Config',
        contentType: 'application/json',
        enabled: true,
        description: 'Configuration files'
      },
      {
        id: 'text',
        type: 'text',
        label: 'Explanations',
        contentType: 'text/plain',
        enabled: true,
        description: 'Text explanations'
      }
    ],
    defaultOutput: 'code',
    autoRouting: {
      enabled: true,
      rules: {
        detectJson: true,
        detectCode: true,
        detectMarkdown: true,
        detectHtml: false
      }
    },
    multiOutput: {
      enabled: true,
      formats: ['code', 'markdown']
    }
  },
  
  // Analysis agent - structured data outputs
  analysis: {
    outputs: [
      {
        id: 'json',
        type: 'json',
        label: 'Data',
        contentType: 'application/json',
        enabled: true,
        description: 'Structured analysis results'
      },
      {
        id: 'csv',
        type: 'csv',
        label: 'CSV',
        contentType: 'text/csv',
        enabled: true,
        description: 'Tabular data'
      },
      {
        id: 'markdown',
        type: 'markdown',
        label: 'Report',
        contentType: 'text/markdown',
        enabled: true,
        description: 'Report in markdown'
      },
      {
        id: 'text',
        type: 'text',
        label: 'Conclusions',
        contentType: 'text/plain',
        enabled: true,
        description: 'Text conclusions'
      }
    ],
    defaultOutput: 'json',
    autoRouting: {
      enabled: true,
      rules: {
        detectJson: true,
        detectCode: false,
        detectMarkdown: true,
        detectHtml: false
      }
    },
    multiOutput: {
      enabled: true,
      formats: ['json', 'markdown']
    }
  },
  
  // Creative agent - rich content outputs
  creative: {
    outputs: [
      {
        id: 'markdown',
        type: 'markdown',
        label: 'Content',
        contentType: 'text/markdown',
        enabled: true,
        description: 'Creative content in markdown'
      },
      {
        id: 'html',
        type: 'html',
        label: 'HTML',
        contentType: 'text/html',
        enabled: true,
        description: 'HTML for web content'
      },
      {
        id: 'text',
        type: 'text',
        label: 'Text',
        contentType: 'text/plain',
        enabled: true,
        description: 'Plain text'
      },
      {
        id: 'json',
        type: 'json',
        label: 'Metadata',
        contentType: 'application/json',
        enabled: false,
        description: 'Content metadata'
      }
    ],
    defaultOutput: 'markdown',
    autoRouting: {
      enabled: true,
      rules: {
        detectJson: false,
        detectCode: false,
        detectMarkdown: true,
        detectHtml: true
      }
    },
    multiOutput: {
      enabled: false,
      formats: []
    }
  }
};

// Helper functions for routing analysis
export class RoutingAnalyzer {
  static detectContentType(content: string): OutputType {
    // Try to detect JSON
    if (this.isValidJson(content)) {
      return 'json';
    }
    
    // Detect code blocks
    if (this.hasCodeBlocks(content)) {
      return 'code';
    }
    
    // Detect HTML tags
    if (this.hasHtmlTags(content)) {
      return 'html';
    }
    
    // Detect markdown features
    if (this.hasMarkdownFeatures(content)) {
      return 'markdown';
    }
    
    // Default to text
    return 'text';
  }
  
  static isValidJson(content: string): boolean {
    try {
      JSON.parse(content.trim());
      return true;
    } catch {
      return false;
    }
  }
  
  static hasCodeBlocks(content: string): boolean {
    return /```[\s\S]*?```|`[^`]+`/.test(content);
  }
  
  static hasHtmlTags(content: string): boolean {
    return /<[^>]+>/.test(content);
  }
  
  static hasMarkdownFeatures(content: string): boolean {
    return /#{1,6}\s|^\*|\*\*.*\*\*|\[.*\]\(.*\)|^\d+\.\s/m.test(content);
  }
  
  static shouldRoute(content: string, route: OutputRoute): boolean {
    if (!route.conditions) return false;
    
    // Check contains conditions
    if (route.conditions.contains) {
      const found = route.conditions.contains.some(term => 
        content.toLowerCase().includes(term.toLowerCase())
      );
      if (!found) return false;
    }
    
    // Check regex matches
    if (route.conditions.matches) {
      if (!route.conditions.matches.test(content)) return false;
    }
    
    // Check length conditions
    if (route.conditions.length) {
      const len = content.length;
      if (route.conditions.length.min && len < route.conditions.length.min) return false;
      if (route.conditions.length.max && len > route.conditions.length.max) return false;
    }
    
    return true;
  }
  
  static applyTransform(content: string, transform: OutputRoute['transform']): string {
    if (!transform) return content;
    
    let result = content;
    
    // Apply template
    if (transform.template) {
      result = transform.template.replace('{{content}}', result);
    }
    
    // Apply formatting
    if (transform.format) {
      switch (transform.format) {
        case 'uppercase':
          result = result.toUpperCase();
          break;
        case 'lowercase':
          result = result.toLowerCase();
          break;
        case 'title':
          result = result.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
          );
          break;
        case 'sentence':
          result = result.charAt(0).toUpperCase() + result.slice(1);
          break;
      }
    }
    
    // Apply length limit
    if (transform.maxLength && result.length > transform.maxLength) {
      result = result.substring(0, transform.maxLength) + '...';
    }
    
    // Basic sanitization
    if (transform.sanitize) {
      result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    
    return result;
  }
}

// Export helper to get content type based on route
export function getContentTypeForRoute(route: OutputRoute): string {
  return route.contentType;
}

// Export helper to get icon for output type
export function getIconForOutputType(type: OutputType): string {
  const icons: Record<OutputType, string> = {
    text: '📝',
    json: '🔧',
    markdown: '📋',
    html: '🌐',
    code: '💻',
    yaml: '⚙️',
    xml: '🏷️',
    csv: '📊'
  };
  return icons[type] || '📄';
}