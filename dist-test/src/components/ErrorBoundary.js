import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from 'react';
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            const isDev = import.meta.env.DEV;
            return this.props.fallback || (_jsxs("div", { style: {
                    padding: '20px',
                    margin: '20px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    color: '#991b1b'
                }, children: [_jsx("h3", { style: { margin: '0 0 10px 0', fontSize: '16px' }, children: "\u6E32\u67D3\u51FA\u9519" }), _jsx("p", { style: { margin: '0 0 10px 0', fontSize: '14px' }, children: "\u8BE5\u533A\u57DF\u6E32\u67D3\u65F6\u53D1\u751F\u9519\u8BEF\uFF0C\u4E0D\u5F71\u54CD\u5176\u4ED6\u529F\u80FD\u4F7F\u7528\u3002" }), _jsxs("div", { style: {
                            margin: '10px 0',
                            padding: '10px',
                            backgroundColor: '#fff',
                            borderRadius: '4px',
                            fontSize: '13px',
                            lineHeight: '1.6'
                        }, children: [_jsx("p", { style: { margin: '0 0 8px 0', fontWeight: 500 }, children: "\u5EFA\u8BAE\u64CD\u4F5C\uFF1A" }), _jsxs("ul", { style: { margin: 0, paddingLeft: '20px' }, children: [_jsx("li", { children: "\u91CD\u65B0\u4E0A\u4F20\u6587\u4EF6\u6216\u7C98\u8D34\u8868\u683C\u6587\u672C" }), _jsx("li", { children: "\u51CF\u5C11\u9009\u62E9\u7684\u5B57\u6BB5\u6570\u91CF\uFF08\u5EFA\u8BAE\u9009\u62E9 5-10 \u4E2A\u6838\u5FC3\u5B57\u6BB5\uFF09" }), _jsx("li", { children: "\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5" }), _jsx("li", { children: "\u5982\u95EE\u9898\u6301\u7EED\uFF0C\u8BF7\u8054\u7CFB\u5F00\u53D1\u8005\u5E76\u63D0\u4F9B\u9519\u8BEF\u8BE6\u60C5" })] })] }), isDev && this.state.error && (_jsxs("details", { style: { fontSize: '12px', color: '#666', marginTop: '10px' }, children: [_jsx("summary", { style: { cursor: 'pointer', marginBottom: '5px' }, children: "\u9519\u8BEF\u8BE6\u60C5\uFF08\u4EC5\u5F00\u53D1\u73AF\u5883\uFF09" }), _jsxs("pre", { style: {
                                    margin: '5px 0',
                                    padding: '10px',
                                    backgroundColor: '#fff',
                                    borderRadius: '4px',
                                    overflow: 'auto',
                                    fontSize: '11px'
                                }, children: [this.state.error.message, this.state.error.stack && (_jsxs(_Fragment, { children: ['\n\n', this.state.error.stack] }))] })] }))] }));
        }
        return this.props.children;
    }
}
