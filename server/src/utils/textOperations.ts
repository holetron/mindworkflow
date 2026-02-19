export type TextOperation =
  | { op: 'retain'; count: number }
  | { op: 'insert'; text: string }
  | { op: 'delete'; count: number };

function normalizeOperations(ops: TextOperation[]): TextOperation[] {
  const result: TextOperation[] = [];

  for (const op of ops) {
    if (op.op === 'insert') {
      if (!op.text) {
        continue;
      }
      const last = result[result.length - 1];
      if (last && last.op === 'insert') {
        last.text += op.text;
      } else {
        result.push({ op: 'insert', text: op.text });
      }
      continue;
    }

    if (op.count <= 0) {
      continue;
    }

    const last = result[result.length - 1];
    if (last && last.op === op.op) {
      last.count += op.count;
    } else {
      result.push({ op: op.op, count: op.count });
    }
  }

  return result;
}

export function diffToTextOperations(before: string, after: string): TextOperation[] {
  if (before === after) {
    return [];
  }

  const beforeText = before ?? '';
  const afterText = after ?? '';

  let prefix = 0;
  const minLength = Math.min(beforeText.length, afterText.length);
  while (prefix < minLength && beforeText[prefix] === afterText[prefix]) {
    prefix += 1;
  }

  let beforeSuffix = beforeText.length;
  let afterSuffix = afterText.length;
  while (
    beforeSuffix > prefix &&
    afterSuffix > prefix &&
    beforeText[beforeSuffix - 1] === afterText[afterSuffix - 1]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const operations: TextOperation[] = [];

  if (prefix > 0) {
    operations.push({ op: 'retain', count: prefix });
  }

  const deleteCount = beforeSuffix - prefix;
  if (deleteCount > 0) {
    operations.push({ op: 'delete', count: deleteCount });
  }

  const insertText = afterText.slice(prefix, afterSuffix);
  if (insertText.length > 0) {
    operations.push({ op: 'insert', text: insertText });
  }

  const suffixCount = afterText.length - afterSuffix;
  if (suffixCount > 0) {
    operations.push({ op: 'retain', count: suffixCount });
  }

  return normalizeOperations(operations);
}

export function applyTextOperations(base: string, ops: TextOperation[]): string {
  if (!Array.isArray(ops) || ops.length === 0) {
    return base;
  }

  let index = 0;
  let result = '';

  for (const op of ops) {
    if (op.op === 'retain') {
      if (op.count < 0) {
        throw new Error('Retain operation must have non-negative count');
      }
      const end = index + op.count;
      if (end > base.length) {
        throw new Error('Retain operation exceeds base length');
      }
      result += base.slice(index, end);
      index = end;
    } else if (op.op === 'delete') {
      if (op.count < 0) {
        throw new Error('Delete operation must have non-negative count');
      }
      const end = index + op.count;
      if (end > base.length) {
        throw new Error('Delete operation exceeds base length');
      }
      index = end;
    } else if (op.op === 'insert') {
      if (!op.text) {
        continue;
      }
      result += op.text;
    } else {
      const exhaustive: never = op;
      throw new Error(`Unknown text operation: ${JSON.stringify(exhaustive)}`);
    }
  }

  if (index < base.length) {
    result += base.slice(index);
  }

  return result;
}

