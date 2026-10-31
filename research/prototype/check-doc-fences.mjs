import { readFileSync } from "node:fs";
for (const file of ["docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md", "docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_HANDOFF.md"]) {
  const lines = readFileSync(file, "utf8").split("\n");
  const fences = lines.filter((l) => l.trimStart().startsWith("```")).length;
  const heads = lines.filter((l) => /^#{1,3} /.test(l)).map((l) => l.slice(0, 80));
  console.log(file, "fences", fences, "even", fences % 2 === 0, "headings", heads.length);
  console.log(heads.filter((h) => /^## 1[0-9]?\.|^### 12\./.test(h)).join(" | "));
}
