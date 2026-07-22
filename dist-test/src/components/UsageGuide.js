import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
export default function UsageGuide() {
    const [expanded, setExpanded] = useState(false);
    return (_jsxs("div", { style: styles.wrapper, children: [_jsxs("button", { onClick: () => setExpanded(!expanded), style: styles.toggleButton, children: [expanded ? '▼' : '▶', " \u4F7F\u7528\u8BF4\u660E"] }), expanded && (_jsx("div", { style: styles.content, children: _jsxs("ol", { style: styles.list, children: [_jsx("li", { children: "\u4ECE Excel \u4E2D\u590D\u5236\u6574\u5757\u8868\u683C\u3002" }), _jsx("li", { children: "\u7C98\u8D34\u5230\u4E0B\u65B9\u6587\u672C\u6846\u3002" }), _jsx("li", { children: "\u7B2C\u4E00\u884C\u5FC5\u987B\u662F\u5B57\u6BB5\u540D\uFF0C\u540E\u9762\u6BCF\u4E00\u884C\u662F\u6570\u636E\u3002" }), _jsx("li", { children: "\u70B9\u51FB\"\u89E3\u6790\u6570\u636E\"\u3002" }), _jsx("li", { children: "\u9009\u62E9\u5206\u6790\u5B57\u6BB5\uFF0C\u5E76\u8F93\u5165\u4F60\u7684\u6570\u503C\u3002" }), _jsx("li", { children: "\u67E5\u770B\u7EDF\u8BA1\u6307\u6807\u3001\u6392\u540D\u5B9A\u4F4D\u548C\u56FE\u8868\u5206\u6790\u3002" }), _jsx("li", { children: "\u672C\u5DE5\u5177\u9ED8\u8BA4\u5728\u6D4F\u89C8\u5668\u672C\u5730\u8FD0\u884C\uFF0C\u6570\u636E\u4E0D\u4E0A\u4F20\u670D\u52A1\u5668\u3002" })] }) }))] }));
}
const styles = {
    wrapper: {
        marginBottom: '12px',
    },
    toggleButton: {
        padding: '6px 12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '13px',
        color: '#475569',
        cursor: 'pointer',
        fontWeight: 500,
    },
    content: {
        marginTop: '8px',
        padding: '12px 16px',
        background: '#f8fafc',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
    },
    list: {
        margin: 0,
        paddingLeft: '20px',
        fontSize: '13px',
        color: '#475569',
        lineHeight: 1.8,
    },
};
