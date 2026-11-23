# Changelog

## 1.2.2

- 修复 iOS Safari（WebKit）上面板塌缩成空条的问题：面板 `height: fit-content` 依赖子元素内容撑起，纵向链上的 `flex:1`（`flex-basis: 0`）在 WebKit 固有高度计算中按 0 处理；全部改回官方配方的默认 `flex: 0 1 auto`，超高时由列表/表单滚动。

## 1.2.1

- 适配 DSH 0.2.2-rc.5：`@deepseek-ai/dsh-client-ui-primitives` 移除 `useAnchoredPosition`，面板定位迁移到 CSS Anchor Positioning（触发器唯一 `anchor-name` + 面板 `position-anchor` + `anchor()` 内嵌），对齐官方模型选择器配方。
- 补桌面标题栏避让（`--dsh-frame-overlay-top`）与 `height: fit-content` 稳妥尺寸。
- 修复输入法组合态按 Escape 误关面板的问题（`isComposing` 守卫）。

## 1.2.0

- 排序模式：置顶 / 上移 / 下移 / 移到底，顺序持久保存。
- 首次公开 npm 发布（原名 `@local/prompt-library`）。
