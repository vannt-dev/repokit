import { MANAGED_HEADER, type Module } from "../model.js";

const EDITORCONFIG = `# ${MANAGED_HEADER}
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{ps1,psm1,bat,cmd}]
end_of_line = crlf

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;

const GITATTRIBUTES = [
  "* text=auto eol=lf",
  "*.{ps1,psm1,bat,cmd} text eol=crlf",
  "*.{png,jpg,jpeg,gif,ico,webp,pdf,zip,gz,woff,woff2} binary",
].join("\n");

export const editorconfigModule: Module = {
  id: "editorconfig",
  enabled: (config) => config.modules.editorconfig,
  outputs: () => [
    { kind: "file", module: "editorconfig", path: ".editorconfig", content: EDITORCONFIG },
    {
      kind: "block",
      module: "editorconfig",
      path: ".gitattributes",
      id: "editorconfig",
      comment: "hash",
      body: GITATTRIBUTES,
    },
  ],
};
