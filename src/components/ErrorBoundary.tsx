import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;
      
      return this.props.fallback || (
        <div style={{
          padding: '20px',
          margin: '20px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#991b1b'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>渲染出错</h3>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            该区域渲染时发生错误，不影响其他功能使用。
          </p>
          <div style={{ 
            margin: '10px 0', 
            padding: '10px', 
            backgroundColor: '#fff', 
            borderRadius: '4px',
            fontSize: '13px',
            lineHeight: '1.6'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 500 }}>建议操作：</p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>重新上传文件或粘贴表格文本</li>
              <li>减少选择的字段数量（建议选择 5-10 个核心字段）</li>
              <li>刷新页面后重试</li>
              <li>如问题持续，请联系开发者并提供错误详情</li>
            </ul>
          </div>
          {isDev && this.state.error && (
            <details style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '5px' }}>错误详情（仅开发环境）</summary>
              <pre style={{ 
                margin: '5px 0', 
                padding: '10px', 
                backgroundColor: '#fff', 
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '11px'
              }}>
                {this.state.error.message}
                {this.state.error.stack && (
                  <>
                    {'\n\n'}
                    {this.state.error.stack}
                  </>
                )}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
