# Script Template Notes

复制当前模板脚本创建新脚本时，优先修改这些字段。单文件脚本默认放在 `src/userscripts/<script-id>/<script-id>.user.js`；需要拆分模块的脚本改用「多模块形态」：metadata 放在 `src/userscripts/<script-id>/<script-id>.entry.js`（ESM 入口，不写 `@require`，`@downloadURL`/`@updateURL` 指向 `dist/<script-id>.user.js` raw 路径），同目录 `*.lib.js` 用 import/export 组织，`npm run build` 产出 dist 单文件与旧路径桥接文件。

- `@name`: 脚本名称。
- `@name:zh-CN` / `@name:en`: 脚本有中文用户界面或跨语言使用场景时，补充本地化名称。
- `@namespace`: 通常使用仓库地址或个人域名。
- `@version`: 递增与询问规则以 `PRODUCT.md`「Version Policy」为准（ADR-0002）。改版本前先 `git fetch origin master`，再用 `node scripts/version-plan.mjs plan --target '<安装身份>=<目标版本>'` 只读预览完整计划；只有精确下一 patch 可沿用任务发布授权，其他升级需确认并记录匹配的 `Version-Approval` trailer。候选 CI 全绿后由 promote 把同一提交快进到 `master`；该快进即通过 raw update URL 发布，版本不再改写，修复使用下一个 patch。多模块脚本的版本写在 entry metadata，构建自动传播到 dist 与桥接文件。
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

安装文件归属由 `scripts/lib/userscript-inventory.mjs` 集中读取：Entry 优先拥有同 stem 的 Bridge 与对应 Dist，旧 Bridge 的 metadata 不会产生额外安装身份；无 Entry 时可由下载 URL 推断历史 Bridge/Dist 配对。工作区与 Git ref adapter 只读取文本，按规范化路径排序，每个文件读取一次，返回归属、各份 metadata、内容和稳定类型的结构诊断。Shared Lib 不进入清单；Example 模板属于完整 Version Plan，目前共五个身份。

各阶段保留自己的政策：Build 允许输出尚未生成或过时，仍验证 Entry metadata、版本常量和 import 图，Entry 的真实 I/O 错误必须失败；lint 检查安装 URL、身份唯一性及 Bridge/Dist 字节相等，兼容无 Entry 的历史配对；Version Plan 要求真实 Entry、完整配对和身份／版本一致，保持现有 schema、canonical JSON、摘要和审批语义。Promote 从可信 master 加载 Version Plan、Inventory、source adapter 与 metadata parser；候选始终只作 Git 对象文本读取，不动态加载候选 module。

改写已有脚本时，建议额外记录：

- 原脚本来源链接。
- 原作者和许可证。
- 本仓库修改了哪些功能。
- 当前脚本适配的网站版本或页面特征。
