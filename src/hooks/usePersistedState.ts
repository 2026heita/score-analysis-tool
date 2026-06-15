/**
 * 持久化状态 Hook
 * 封装 localStorage 的保存、恢复、清空逻辑
 * 不拥有核心业务状态，仅提供存储方法
 */

import { useCallback } from 'react';
import { saveState, loadSavedState, clearSavedState, getSystemDefaultState } from '../utils/storage';
import type { SavedState } from '../types';

/**
 * 持久化状态 Hook
 * @returns 保存、恢复、清空方法
 */
export function usePersistedState() {
  /**
   * 加载已保存的状态
   */
  const loadState = useCallback((): SavedState | null => {
    return loadSavedState();
  }, []);

  /**
   * 保存状态到 localStorage
   */
  const save = useCallback((state: SavedState): void => {
    try {
      saveState(state);
    } catch {
      // 静默失败
    }
  }, []);

  /**
   * 清空 localStorage
   */
  const clear = useCallback((): void => {
    clearSavedState();
  }, []);

  /**
   * 获取系统默认状态
   */
  const getDefault = useCallback((): SavedState => {
    return getSystemDefaultState();
  }, []);

  return {
    loadState,
    save,
    clear,
    getDefault,
  };
}
