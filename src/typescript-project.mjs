import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function loadTypeScriptProject(ts, configPath) {
  const absoluteConfig = resolve(configPath);
  const config = ts.readConfigFile(absoluteConfig, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const root = dirname(absoluteConfig);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(parsed.errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  const files = program.getSourceFiles().filter(file => {
    const rel = relative(root, file.fileName);
    return !file.isDeclarationFile && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
  });
  return { absoluteConfig, root, parsed, program, files };
}
