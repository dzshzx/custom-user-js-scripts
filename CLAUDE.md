# 项目契约

- npm ci 安装构建/测试依赖。脚本需要的 npm 包经 lib 模块 import 引入，由 esbuild 打进 dist；安装产物自包含，不用 @require。依赖精确锁版。
- 源码是 TypeScript（src 下 .ts/.tsx，esbuild 构建时擦除类型）；多模块脚本 metadata 归 *.entry.ts；修改源码后 npm run build，并一起提交 dist 安装文件。生成文件不手改；新 lib 接入 entry import 图。
- GM storage key 是用户数据契约，改名或移动保持不变，除非任务包含迁移。
- 发布规则归 PRODUCT.md「Version Policy」；沿用任务已有发布授权，缺少决定时先完成可推候选。
- 移动脚本同步测试路径、文档与 @downloadURL/@updateURL。安装路径、metadata 或行为变化同步 README 和相关 docs/scripts。
- UI 改动读 DESIGN.md。
- 聚焦测试用 node --import ./scripts/jsx-loader.mjs --test test/<name>.test.mjs（加载器支持 .ts/.tsx）。
