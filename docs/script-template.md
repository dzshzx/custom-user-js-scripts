# Script Template Notes

复制当前模板脚本创建新脚本时，优先修改这些字段。单文件脚本默认放在 `src/userscripts/<script-id>/<script-id>.user.js`；需要拆分模块的脚本改用「多模块形态」：metadata 放在 `src/userscripts/<script-id>/<script-id>.entry.ts`（TypeScript ESM 入口，不写 `@require`，`@downloadURL`/`@updateURL` 指向 `dist/<script-id>.user.js` raw 路径），同目录 `*.lib.ts`（含 JSX 用 `*.lib.tsx`）用 import/export 组织，相对导入写 `.ts`/`.tsx` 扩展名、类型只用 `import type`，`npm run build` 只产出 dist 单文件。

- `@name`: 脚本名称。
- `@name:zh-CN` / `@name:en`: 脚本有中文用户界面或跨语言使用场景时，补充本地化名称。
- `@namespace`: 通常使用仓库地址或个人域名。
- `@version`: 档位规则见 `PRODUCT.md`「Version Policy」，发版步骤见 README「开发与验证」。多模块脚本的版本写在 entry metadata。
- `@description`: 简短说明脚本功能。
- `@description:zh-CN` / `@description:en`: 脚本有本地化名称时，同步补充本地化简介。
- `@match`: 脚本生效的网址规则。
- `@downloadURL` / `@updateURL`: 单文件脚本两者都指向自身在 `master` 上的 raw 路径（`npm run lint` 强制，否则已安装副本永远收不到更新）；多模块脚本由 entry 指向 `dist/<script-id>.user.js`。
- `@grant`: 需要的浏览器用户脚本 API 权限；没有特殊权限时使用 `none`。

改名或迁移已安装脚本文件时：

- 单人自用脚本可以直接迁移到新路径，但必须同步更新 README/docs 链接、测试路径、`@downloadURL` 和 `@updateURL`（多模块脚本的模块间依赖已由 import + 构建取代 `@require`）。
- 面向多人或公开安装的脚本，旧路径保留至少一个桥接版本，不要直接删除。
- 新文件保留完整实现，后续以新文件为主维护。
- 保持原有存储 key，除非任务明确要求迁移用户数据。
- 不要在同一次迁移里同时改 `@name`、`@namespace` 和文件路径，除非已经测试目标脚本管理器不会安装出重复脚本。

改写已有脚本时，建议额外记录：

- 原脚本来源链接。
- 原作者和许可证。
- 本仓库修改了哪些功能。
- 当前脚本适配的网站版本或页面特征。
