"use strict";
/**
 * Stage 1A-1: 通用字段模式类型定义
 *
 * 设计原则：
 * 1. 不使用 score、courseScore 等教育概念作为核心类型
 * 2. 自动推断值和用户覆盖值分离
 * 3. 可以追踪推断来源和原因
 * 4. 可以表达不确定状态
 */
Object.defineProperty(exports, "__esModule", { value: true });
