/**
 * parseVersionControl - 异步解析版本控制纯逻辑
 * 
 * 职责：
 * - 提供异步解析的版本控制机制
 * - 防止旧解析结果覆盖新数据
 * - 组件卸载保护
 * - 内部更新守卫
 * 
 * 本模块为纯函数/纯逻辑，可被 useParsedTable 和测试共同调用
 */

/** 版本控制状态 */
export interface VersionControlState {
  parseVersionRef: { current: number };
  isMountedRef: { current: boolean };
  pendingInternalRawTextRef: { current: string | null };
}

/** 创建版本控制状态 */
export function createVersionControlState(): VersionControlState {
  return {
    parseVersionRef: { current: 0 },
    isMountedRef: { current: true },
    pendingInternalRawTextRef: { current: null },
  };
}

/** 递增版本号（使旧异步请求失效） */
export function incrementVersion(state: VersionControlState): number {
  return ++state.parseVersionRef.current;
}

/** 检查版本是否匹配（用于丢弃旧结果） */
export function isVersionMatch(state: VersionControlState, version: number): boolean {
  return state.parseVersionRef.current === version;
}

/** 检查组件是否已挂载 */
export function isMounted(state: VersionControlState): boolean {
  return state.isMountedRef.current;
}

/** 设置组件卸载标记 */
export function setMounted(state: VersionControlState, mounted: boolean): void {
  state.isMountedRef.current = mounted;
}

/** 安全的状态设置函数（组件卸载后不写状态） */
export function safeSetState<T>(state: VersionControlState, setter: (v: T) => void, value: T): boolean {
  if (state.isMountedRef.current) {
    setter(value);
    return true;
  }
  return false;
}

/** 处理用户编辑文本（递增版本号，清空内部更新标记） */
export function handleUserEditText(state: VersionControlState, text: string): void {
  if (!state.isMountedRef.current) return;
  
  // 如果是内部同步更新，不递增版本号
  if (state.pendingInternalRawTextRef.current === text) {
    state.pendingInternalRawTextRef.current = null;
    return;
  }
  
  // 用户编辑：立即递增版本号，使旧的异步请求失效
  incrementVersion(state);
  state.pendingInternalRawTextRef.current = null;
}

/** 设置内部更新标记（防止二次解析） */
export function setPendingInternalText(state: VersionControlState, text: string): void {
  state.pendingInternalRawTextRef.current = text;
}

/** 消费内部更新标记（返回是否匹配） */
export function consumePendingInternalText(state: VersionControlState, text: string): boolean {
  if (state.pendingInternalRawTextRef.current === text) {
    state.pendingInternalRawTextRef.current = null;
    return true;
  }
  return false;
}

/** 清空所有版本控制状态 */
export function resetVersionControl(state: VersionControlState): void {
  incrementVersion(state);
  state.pendingInternalRawTextRef.current = null;
}
