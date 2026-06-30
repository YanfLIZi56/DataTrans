<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

<h1 align="center">DataTrans</h1>
<p align="center"><strong>全能数据格式转换器</strong></p>
<p align="center">可视化拖拽编辑 · 多格式互转 · 实时预览 · 暗色模式</p>

---

## 功能亮点

### 格式支持
- **多格式输入** JSON / YAML / CSV / SQL DDL / Java Object / Python Object / Go Object / ES Mapping
- **多格式输出** JSON / YAML / SQL (建表/新增/查询/更新) / Java POJO / Python Dataclass / Go Struct / ES Mapping

### 可视化编辑器
- **块状字段树** 以可拖拽的实体块展示数据结构，嵌套关系用带箭头的贝塞尔曲线连接
- **滚轮缩放 & 拖拽平移** 像画布一样自由浏览复杂数据结构，`Ctrl+0` 一键重置视图
- **子块折叠** 点击字段行的 ▼ 按钮折叠子对象块，再次点击 ▶ 展开，级联隐藏所有后代
- **数组下拉编辑** 点击展开数组，逐项编辑值，底部 Add / Clear 批量操作

### 交互体验
- **粘贴即解析** 粘贴数据后自动解析，可随时开关
- **快捷键** `Ctrl+Enter` 解析 / `Ctrl+Shift+C` 弹出转换结果 / `Ctrl+0` 重置缩放
- **历史记录** 输入输出自动保存到 localStorage，刷新页面不丢失
- **暗色模式** 导航栏一键切换亮/暗，深蓝色波点暗色背景
- **苹果无边记风格** 米色波点背景，清新黄色主色调

### 字段操作
- **类型转换** 字段类型可在 string / integer / float / boolean / object / array / null 之间自由切换
- **增删字段** 新增子字段、删除字段，数组元素逐项增删
- **实时转换** 修改字段后自动生成目标格式，弹窗展示结果

### 输出
- **弹窗预览** 点击 Convert 弹出转换结果，支持语法高亮
- **一键复制** 复制到剪贴板
- **下载文件** 根据输出格式自动匹配后缀（`.json` / `.yaml` / `.sql` / `.java` / `.py` / `.go`）

## 快速开始

```bash
# 克隆项目
git clone <your-repo-url>
cd datatrans

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 使用方式

1. 在浮动面板粘贴数据（JSON / YAML / CSV 等），选择对应格式
2. 点击 **Parse & Visualize** 解析（或 `Ctrl+Enter`，或开启粘贴自动解析）
3. 可视化区域出现字段树：
   - **拖拽方块** 自由排列位置
   - **滚轮** 缩放视图
   - **拖拽背景** 平移镜头
   - **点击 ▼/▶** 折叠/展开子块
4. 顶部选择 **Target Format**，点击 **转换** 查看结果（`Ctrl+Shift+C`）
5. 在弹窗中**复制**或**下载文件**

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 + Composition API | 前端框架 |
| TypeScript | 类型安全 |
| Pinia | 状态管理 |
| Tailwind CSS | 样式 + 暗色模式 |
| interact.js | 拖拽交互 |
| js-yaml | YAML 解析/生成 |
| PapaParse | CSV 解析 |
| node-sql-parser | SQL 解析 |
| nanoid | 唯一 ID 生成 |

## 项目结构

```
src/
├── components/
│   ├── EntityBlock.vue      # 字段块组件（表头、字段行、数组下拉、折叠按钮）
│   ├── FieldTree.vue        # 可视化画布（缩放、平移、连接线、块布局、折叠）
│   ├── FieldTreeNode.vue    # 字段树节点（递归渲染）
│   ├── InputPanel.vue       # 浮动输入面板（拖拽移动、粘贴自动解析）
│   ├── ModalPopup.vue       # 转换结果弹窗（复制、下载）
│   └── ToastNotification.vue # 提示消息
├── composables/
│   ├── useGenerator.ts      # 输出生成器（JSON/YAML/SQL/代码）
│   └── useParser.ts         # 输入解析器（各格式 → 字段树）
├── stores/
│   └── dataStore.ts         # Pinia 全局状态（历史记录持久化）
├── types/
│   └── index.ts             # TypeScript 类型定义
├── App.vue                  # 主布局（快捷键、暗色模式切换）
├── main.ts                  # 入口
└── style.css                # 全局样式（波点背景、暗色模式）
```

## License

MIT © DataTrans