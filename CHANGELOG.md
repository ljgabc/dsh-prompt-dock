# Changelog

## 1.4.1

- 1.4.0 的 tarball 卡在 npm 发布管线未落地（元数据已登记但对象 404），此版本为同内容的重新发布。

## 1.4.0

- 导入导出：面板底部新增「导入 / 导出」。导出下载库的 JSON 备份（含标题、正文、顺序、时间戳）；导入合并去重（标题+正文一致视为重复），无效行与超限行跳过并汇报计数，Host 侧统一校验。空库导入即完整恢复备份（顺序按文件序保留）。

## 1.3.0

- 自包含 UI：图标、按钮、菜单材质（含 macOS 背板）、外点关闭全部改为本地实现（移植自 shell 配方，仅用公开 `--dsw-*` 主题令牌），运行时只依赖 `react`/`react-dom`，不再引用内部包 `@deepseek-ai/dsh-client-ui-primitives`，降低 DSH 升级破坏面。

## 1.2.2

- 修复 iOS Safari（WebKit）上面板塌缩成空条的问题：面板 `height: fit-content` 依赖子元素内容撑起，纵向链上的 `flex:1`（`flex-basis: 0`）在 WebKit 固有高度计算中按 0 处理；全部改回官方配方的默认 `flex: 0 1 auto`，超高时由列表/表单滚动。

## 1.2.1

- 适配 DSH 0.2.2-rc.5：`@deepseek-ai/dsh-client-ui-primitives` 移除 `useAnchoredPosition`，面板定位迁移到 CSS Anchor Positioning（触发器唯一 `anchor-name` + 面板 `position-anchor` + `anchor()` 内嵌），对齐官方模型选择器配方。
- 补桌面标题栏避让（`--dsh-frame-overlay-top`）与 `height: fit-content` 稳妥尺寸。
- 修复输入法组合态按 Escape 误关面板的问题（`isComposing` 守卫）。

## 1.2.0

- 排序模式：置顶 / 上移 / 下移 / 移到底，顺序持久保存。
- 首次公开 npm 发布（此前自用名为 `@local/prompt-library`）。
