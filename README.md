# dsh-prompt-library

**DeepSeek Harness 预置提示词库插件** —— 输入框旁一键取用你的常用提示词，数据存 Host 侧，电脑、手机所有客户端共享。

*A preset prompt library for DeepSeek Harness: one picker beside the composer, backed by Host-side storage shared by every client of the Host.*

简体中文 | [English](#english)

---

## 它解决什么问题

高频使用的提示词不该每次都翻聊天记录或笔记。这个插件把「取用常用提示词」压缩成两步：

```
点输入框旁的「提示词」按钮 → 点某一条
```

输入框为空时点选直接填入草稿；已有内容时插入到光标处（走 DSH 官方的可撤销纯文本编辑通道，`Ctrl/Cmd+Z` 可撤销）。**只填草稿，永不代发。**

## 功能

- **一键取用**：整行点选填入/插入，发送前还能微调
- **完整管理**：新建、编辑、删除（内联表单，保存失败不清空已填内容）
- **排序模式**：置顶 / 上移 / 下移 / 移到底，顺序持久保存
- **多端共享**：数据存 **Host 侧**（storageDomain 持久化），桌面浏览器与手机浏览器连同一个 Host 时看到的是**同一份库**——在电脑上整理好，手机上直接用
- **原生观感**：复用 DSH 自带的菜单材质与 CSS 锚点定位（与模型选择器同一套配方），随主题明暗自适应；中英文界面跟随 DSH 语言设置
- **零依赖、不联网**：不请求任何外部地址，没有账号与服务端

## 安装

前置：DeepSeek Harness（插件在 Web GUI 的输入框旁出现，要求 DSH ≥ 0.2.2-rc.5）。

**方式一：npm（推荐）**

在「插件 → 添加插件」对话框里只填包名本身：

```
dsh-prompt-library
```

或在终端：

```sh
dsh plugin --profile <你的profile> add dsh-prompt-library
```

**方式二：本地目录（开发者）**

```sh
git clone <本仓库> && dsh plugin --profile <你的profile> add ./prompt-library
```

或软链接到 profile 的 `node_modules/dsh-prompt-library`，改代码后重启 DSH 即可。

> 安装或更新后需重启 DSH（profile 在启动期加载）。

## 使用

1. 输入框工具行点「提示词」（书签图标）
2. 面板中点某一条 → 填入/插入草稿；「新建」写自己的提示词
3. 「排序」进入整理模式，用四个方向按钮调整顺序，「完成」退出
4. 编辑/删除在每行尾部；误操作在表单里「取消」即可

## 数据与隐私

| 项 | 说明 |
|---|---|
| 存储位置 | DSH profile 的 storageDomain 持久存储（Host 侧磁盘） |
| 是否上传 | ❌ 不上传任何数据，无外部请求 |
| 多端 | 同一 Host 的所有客户端（桌面/手机浏览器）共享同一份 |
| 容量上限 | 200 条，单条正文 ≤ 20000 字符 |
| 卸载 | 随插件卸载清除该存储域 |

## 已知边界

- 草稿「整段替换」依赖 DSH `InputActions` 能力边界：空草稿直接设置，非空时插入光标处，不主动清空
- 面板定位使用 CSS Anchor Positioning，需要较新的浏览器内核（iOS Safari 18+/Chrome 125+ 实测可用）

## 许可

[MIT](LICENSE)
