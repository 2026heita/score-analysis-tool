/**
 * TypeScript loader hooks for Node.js ESM
 * Resolves extensionless imports to .ts/.tsx files
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  // Handle relative imports without extensions or with .js extension
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = dirname(parentPath);
    
    // If specifier ends with .js, try .ts first
    if (specifier.endsWith('.js')) {
      const tsPath = pathResolve(parentDir, specifier.replace(/\.js$/, '.ts'));
      if (existsSync(tsPath)) {
        return { url: pathToFileURL(tsPath).href, shortCircuit: true };
      }
      const tsxPath = pathResolve(parentDir, specifier.replace(/\.js$/, '.tsx'));
      if (existsSync(tsxPath)) {
        return { url: pathToFileURL(tsxPath).href, shortCircuit: true };
      }
    }
    
    // Try exact path with .ts extension
    const tsPath = pathResolve(parentDir, specifier + '.ts');
    if (existsSync(tsPath)) {
      return { url: pathToFileURL(tsPath).href, shortCircuit: true };
    }
    
    // Try with .tsx extension
    const tsxPath = pathResolve(parentDir, specifier + '.tsx');
    if (existsSync(tsxPath)) {
      return { url: pathToFileURL(tsxPath).href, shortCircuit: true };
    }
    
    // Try as directory with index.ts
    const dirPath = pathResolve(parentDir, specifier);
    const indexPath = pathResolve(dirPath, 'index.ts');
    if (existsSync(indexPath)) {
      return { url: pathToFileURL(indexPath).href, shortCircuit: true };
    }
  }
  
  return nextResolve(specifier, context);
}

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
        jsx: 'react',
      },
    });
    return { format: 'module', source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
