import { readFile } from 'node:fs/promises';
import ts from 'typescript';

export async function loadEditorialCatalog() {
  const mapping = JSON.parse(await readFile(new URL('../src/domain/vocabulary/identityMapping.json', import.meta.url), 'utf8'));
  const identitySource = (await readFile(new URL('../src/domain/vocabulary/identities.ts', import.meta.url), 'utf8')).replace(/^import mapping from .*;$/m, `const mapping = ${JSON.stringify(mapping)};`);
  const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const identityUrl = `data:text/javascript;base64,${Buffer.from(compile(identitySource)).toString('base64')}`;
  const source = (await readFile(new URL('../src/domain/vocabulary/catalog.ts', import.meta.url), 'utf8')).replace("'./identities'", JSON.stringify(identityUrl));
  return (await import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`)).VOCABULARY_CATALOG;
}
