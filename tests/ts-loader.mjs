/**
 * Custom TypeScript loader for Node.js ESM
 * Allows running .ts files directly without compilation
 * Handles extensionless relative imports by resolving to .ts/.tsx files
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Register the hooks
register('./tests/ts-loader-hooks.mjs', pathToFileURL('./'));

// Transpile TypeScript source code
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const { source } = await nextLoad(url, { ...context, format: 'module' });
    const code = typeof source === 'string' ? source : Buffer.from(source).toString('utf-8');
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
    return { format: 'module', source: result.outputText };
  }
  return nextLoad(url, context);
}
