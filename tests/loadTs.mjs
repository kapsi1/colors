import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Load small TS module graphs with the existing compiler, without another test
// dependency or generated files. Identical URLs share module instances.
const modules = new Map()
function sourceUrl(path) {
  if (modules.has(path.href)) return modules.get(path.href)
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  const code = outputText.replace(/from (['"])([^'"]+)\1/g, (_, quote, specifier) => {
    const url = specifier.startsWith('.')
      ? sourceUrl(new URL(`${specifier}.ts`, path)) : import.meta.resolve(specifier)
    return `from ${quote}${url}${quote}`
  })
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  modules.set(path.href, url)
  return url
}
export const load = path => import(sourceUrl(new URL(path, import.meta.url)))
