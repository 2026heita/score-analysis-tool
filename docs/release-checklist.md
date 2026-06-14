# 发布检查清单

每次功能更新提交前，请确认以下事项：

## 功能变更
- [ ] 是否修改了业务逻辑（src/components、src/engine、src/App.tsx 等）
- [ ] 是否修改了解析、分析、图表相关代码

## 更新日志
- [ ] 是否已更新 `src/data/updateLogs.ts`
- [ ] 是否已更新 `src/config/version.ts` 中的 `APP_VERSION`
- [ ] 新增日志条目是否包含：date、version、title、type、items

## 测试验证
- [ ] 是否运行 `npm run build` 且无 TypeScript 错误
- [ ] 是否运行 `npm run finalAcceptance` 且全部通过
- [ ] 是否运行 `npm run test:general-engine` 且全部通过
- [ ] 是否运行 `npm run test:general-overview` 且全部通过
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

**提示**：可运行 `npm run check:release-note` 自动检测是否遗漏更新日志。
