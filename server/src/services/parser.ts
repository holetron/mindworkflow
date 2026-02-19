import Ajv from 'ajv';

export interface ParserInput {
  html: string;
  source?: string;
  schemaRef: string;
}

export interface ParserResult {
  output: string;
  contentType: string;
  logs: string[];
}

export class ParserService {
  constructor(private readonly ajv: Ajv) {}

  run(input: ParserInput): ParserResult {
    const { html, source = 'parser_input', schemaRef } = input;
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? sanitize(titleMatch[1]) : 'Auto-generated document';
    const text = sanitize(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

    const linkRegex = /<a[^>]+href=["'](.*?)["'][^>]*>/gi;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html))) {
      links.push(match[1]);
    }

    const payload = {
      source,
      title,
      text,
      links,
    };

    const validator = this.ajv.getSchema(schemaRef);
    if (!validator) {
      throw new Error(`Parser schema ${schemaRef} not registered`);
    }

    if (!validator(payload)) {
      const message = this.ajv.errorsText(validator.errors, { dataVar: 'PARSER' });
      throw new Error(`Parser output invalid: ${message}`);
    }

    const logs = [
      `Parser processed HTML length ${html.length}`,
      `Extracted ${links.length} links`,
    ];

    return {
      output: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
      logs,
    };
  }
}

function sanitize(value: string): string {
  return value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
