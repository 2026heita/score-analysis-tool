# 发布检查清单

## 更新日志规则

**重要**：`updateLogs.ts` 不是每次小修改都更新，而是以"准备推送部署到 Cloudflare Pages 的版本"为单位更新。

### 不需要更新 updateLogs 的情况（开发过程中的小修改）
- 改样式、调位置
- 修小 bug
- 补测试、调测试
- 改文案、改注释
- 删除 console.log
- 调整组件参数（如 max-height）

### 需要更新 updateLogs 的情况（准备 push origin/master 部署前）
- 新增功能模块
- 优化用户体验
- 修复影响功能的 bug
- 性能优化

### 正确示例
```
标题：新增示例数据与公告体验优化
内容：
- 新增多领域示例数据，支持快速体验平台分析能力
- 优化更新公告展示，展开后支持固定窗口内滚动
- 完善示例数据加载流程，切换样例时自动清理旧状态
```

### 错误示例（不要写成开发流水账）
- 修复 useMemo 依赖
- 改了一个按钮
- 删除 console.log
- 调整 max-height

---

## 功能变更
- [ ] 是否修改了业务逻辑（src/components、src/engine、src/App.tsx 等）
- [ ] 是否修改了解析、分析、图表相关代码

## 更新日志（仅在准备部署时检查）
- [ ] 本次 updateLogs 是否为面向用户的上线总结，而不是开发流水账？
- [ ] 是否已更新 `src/data/updateLogs.ts`（准备 push 部署时）
- [ ] 是否已更新 `src/config/version.ts` 中的 `APP_VERSION`（准备 push 部署时）
- [ ] 新增日志条目是否包含：date、version、title、type、items

## 测试验证
- [ ] 是否运行 `npm run build` 且无 TypeScript 错误
- [ ] 是否运行 `npm run finalAcceptance` 且全部通过
- [ ] 是否运行 `npm run test:general-engine` 且全部通过
- [ ] 是否运行 `npm run test:general-overview` 且全部通过
- [ ] 是否运行 `npm run test:sample-data` 且全部通过
- [ ] 是否运行 `npm run preview` 并验证页面功能正常

## 页面验证
- [ ] 更新公告是否正常显示
- [ ] 版本号是否正确显示
- [ ] 原有功能是否正常工作
- [ ] 控制台无红色错误

## 提交规范
- [ ] commit message 是否清晰描述本次变更
- [ ] 是否没有提交 dist、node_modules、临时文件
- [ ] 是否没有遗留 console.log、debugger

---

**提示**：可运行 `npm run check:release-note` 自动检测是否遗漏更新日志（仅在准备部署时需要）。
