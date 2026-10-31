# Prototype review bundle

本目录保存原型送审包的原始 zip 与 SHA-256：

- `pi-context-index-prototype-review.zip`
- `pi-context-index-prototype-review.zip.sha256`

两者被 `.gitignore` 忽略，仅在本机保留；可读的文档与原型脚本已经分别复制到 `docs/` 和 `research/prototype/`。

核对方法（Git Bash）：

```sh
cd research/review-bundle
sha256sum -c pi-context-index-prototype-review.zip.sha256
```

包内 `manifest.json` 记录除自身外每个文件的 SHA-256；`verify-bundle.mjs` 可离线复核 105/105 运行、24/24 宿主检查、18/18 结构检查与文档围栏。送审边界见[外审报告](../../docs/reviews/pi-context-index%20原型设计：独立第一性原理外部评审报告.md)与[送审 brief](../../docs/reviews/PI_CONTEXT_INDEX_PROTOTYPE_REVIEW_BRIEF.md)。
