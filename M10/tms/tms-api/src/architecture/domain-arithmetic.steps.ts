/**
 * Architecture fitness function: scans source text, no runtime behaviour involved.
 */
import { Given, Then } from '@cucumber/cucumber';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

const CONTEXT_ROOT = path.resolve(__dirname, '../cargo-plans');

/**
 * Where measures legitimately turn into numbers: the measure value objects
 * themselves, and the edges – persistence, read models, the HTTP boundary –
 * plus test code and the composition root.
 */
const ALLOWED_FILE = /\/ldm\/loading-meters\.ts$|\.(repository|queries|readmodel|routes|validation|steps)\.ts$|\/in-memory\/|fake-dependency-injection\.ts$|\/index\.ts$/;

const UNWRAPPED_MEASURE = /\.valueIn(Kg|Mm|Ldm|Litres|Unit)\b/;
const NUMERIC_EXTREME = /\bMath\.(min|max)\(/;

interface SourceFile {
  readonly relativePath: string;
  /** Source with comments and error constructions blanked out, line numbers preserved. */
  readonly code: string;
}

interface ArchitectureWorld {
  sources?: SourceFile[];
}

function listTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

/** Replaces every character but newlines with spaces, so reported line numbers stay true. */
const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, blank);
}

/**
 * Error constructions may carry plain numbers – that is wording a message,
 * not computing with a measure. Blanks out `new XxxError( … )` including
 * arguments spanning several lines.
 */
function stripErrorConstructions(source: string): string {
  let result = source;
  const opener = /new \w+Error\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(result)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < result.length; end++) {
      if (result[end] === '(') depth++;
      if (result[end] === ')' && --depth === 0) break;
    }
    result = result.slice(0, match.index) + blank(result.slice(match.index, end + 1)) + result.slice(end + 1);
  }
  return result;
}

function findViolations(sources: SourceFile[], pattern: RegExp): string[] {
  return sources.flatMap(({ relativePath, code }) =>
    code
      .split('\n')
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, lineNumber }) => `${relativePath}:${lineNumber}  ${line}`)
  );
}

Given('the domain and application sources of the cargo-plans context', function (this: ArchitectureWorld) {
  this.sources = listTsFiles(CONTEXT_ROOT)
    .filter((file) => !ALLOWED_FILE.test(file))
    .map((file) => ({
      relativePath: path.relative(CONTEXT_ROOT, file),
      code: stripErrorConstructions(stripComments(fs.readFileSync(file, 'utf8'))),
    }));
  assert(this.sources.length > 0, `No sources found under ${CONTEXT_ROOT}`);
});

Then('no source unwraps a measure into a number', function (this: ArchitectureWorld) {
  const violations = findViolations(this.sources!, UNWRAPPED_MEASURE);
  assert.strictEqual(violations.length, 0, `Measures unwrapped outside the edges – move the rule into the value object:\n${violations.join('\n')}`);
});

Then('no source picks extremes with Math.min or Math.max', function (this: ArchitectureWorld) {
  const violations = findViolations(this.sources!, NUMERIC_EXTREME);
  assert.strictEqual(violations.length, 0, `Numeric extremes outside value objects – use Weight.min / Length.max etc.:\n${violations.join('\n')}`);
});
