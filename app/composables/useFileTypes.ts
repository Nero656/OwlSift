export interface CreatableFileType {
  extension: string
  label: string
  mime: string
  template: (name: string) => string
}

export const creatableFileTypes: CreatableFileType[] = [
  { extension: 'docx', label: 'Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', template: name => name + '\n' },
  { extension: 'pdf', label: 'PDF', mime: 'application/pdf', template: name => name + '\n' },
  { extension: 'odt', label: 'OpenDocument', mime: 'application/vnd.oasis.opendocument.text', template: name => name + '\n' },
  { extension: 'rtf', label: 'Rich Text', mime: 'application/rtf', template: name => name + '\n' },
  { extension: 'tsv', label: 'Table (TSV)', mime: 'text/tab-separated-values', template: () => 'column1\tcolumn2\n' },
  { extension: 'txt', label: 'Text', mime: 'text/plain;charset=utf-8', template: name => `${name}\n` },
  { extension: 'md', label: 'Markdown', mime: 'text/markdown;charset=utf-8', template: name => `# ${name}\n\n` },
  { extension: 'json', label: 'JSON', mime: 'application/json', template: () => '{\n  \n}\n' },
  { extension: 'csv', label: 'CSV', mime: 'text/csv;charset=utf-8', template: () => 'column1,column2\n' },
  { extension: 'html', label: 'HTML', mime: 'text/html;charset=utf-8', template: name => `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>${name}</title>\n</head>\n<body>\n\n</body>\n</html>\n` },
  { extension: 'css', label: 'CSS', mime: 'text/css;charset=utf-8', template: () => '/* styles */\n' },
  { extension: 'js', label: 'JavaScript', mime: 'text/javascript;charset=utf-8', template: () => '\'use strict\'\n\n' },
  { extension: 'ts', label: 'TypeScript', mime: 'text/typescript;charset=utf-8', template: () => 'export {}\n' },
  { extension: 'vue', label: 'Vue', mime: 'text/plain;charset=utf-8', template: name => `<script setup lang="ts">\n</script>\n\n<template>\n  <div>${name}</div>\n</template>\n` },
  { extension: 'py', label: 'Python', mime: 'text/x-python;charset=utf-8', template: () => 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()\n' },
  { extension: 'java', label: 'Java', mime: 'text/x-java-source;charset=utf-8', template: name => `class ${name.replace(/[^a-zA-Z0-9_$]/g, '') || 'Main'} {\n  public static void main(String[] args) {\n  }\n}\n` },
  { extension: 'c', label: 'C', mime: 'text/x-c;charset=utf-8', template: () => '#include <stdio.h>\n\nint main(void) {\n  return 0;\n}\n' },
  { extension: 'cpp', label: 'C++', mime: 'text/x-c++src;charset=utf-8', template: () => '#include <iostream>\n\nint main() {\n  return 0;\n}\n' },
  { extension: 'h', label: 'C/C++ header', mime: 'text/x-c-header;charset=utf-8', template: name => `#pragma once\n\n// ${name}\n` },
  { extension: 'sh', label: 'Shell script', mime: 'text/x-shellscript;charset=utf-8', template: () => '#!/usr/bin/env sh\nset -eu\n\n' },
  { extension: 'sql', label: 'SQL', mime: 'application/sql;charset=utf-8', template: () => '-- SQL script\n' },
  { extension: 'scss', label: 'SCSS', mime: 'text/x-scss;charset=utf-8', template: () => '// SCSS styles\n' },
  { extension: 'yaml', label: 'YAML', mime: 'application/yaml;charset=utf-8', template: () => '# YAML document\n' },
  { extension: 'xml', label: 'XML', mime: 'application/xml;charset=utf-8', template: name => `<?xml version="1.0" encoding="UTF-8"?>\n<${name.replace(/[^a-zA-Z0-9_-]/g, '') || 'root'}></${name.replace(/[^a-zA-Z0-9_-]/g, '') || 'root'}>\n` },
  { extension: 'log', label: 'Log', mime: 'text/plain;charset=utf-8', template: () => '' },
]

export const defaultFileTemplate = (extension: string, name: string) => {
  const type = creatableFileTypes.find(item => item.extension === extension)
  return type?.template(name) ?? ''
}
