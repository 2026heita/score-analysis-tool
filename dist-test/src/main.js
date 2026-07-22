import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { updateLogs, validateUpdateLogs } from './data/updateLogs';
// DEV 环境校验 updateLogs 一致性
if (import.meta.env.DEV) {
    const result = validateUpdateLogs(updateLogs);
    if (!result.valid) {
        console.warn('[updateLogs] 数据一致性检查失败:', result.errors);
        console.warn('[updateLogs] 请检查 src/data/updateLogs.ts 中的数据');
    }
}
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
