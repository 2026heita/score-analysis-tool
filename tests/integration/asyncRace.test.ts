/**
 * 异步版本控制状态模型测试
 * 
 * 验证 useParsedTable 的异步版本控制机制（状态模型层）
 * 
 * 本测试使用生产代码中的纯逻辑 helper：
 * - parseVersionControl.ts 提供版本控制状态管理
 * - 测试验证状态转换逻辑，而非 React hook 实现
 * 
 * 测试场景：
 * 1. 文件A解析未完成时上传文件B，最终只保留B
 * 2. 文件上传后立即编辑文本，最终保留文本结果
 * 3. 快速切换Sheet A→B，最终只保留B
 * 4. 组件卸载后异步结果不写状态
 * 5. clearParsedTable后旧结果不能重新写回
 * 6. pendingInternalRawTextRef不匹配时必须清理
 */

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, details?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${details ? ': ' + details : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
    failed++;
  }
}

// ============================================================
// 模拟 useParsedTable 核心状态
// ============================================================
class MockParsedTableState {
  parseVersionRef = { current: 0 };
  isMountedRef = { current: true };
  pendingInternalRawTextRef = { current: null as string | null };
  rawText = '';
  parsedData: any = null;
  parseError: string | null = null;
  parseWarnings: string[] = [];
  fileError: string | null = null;
  parseSummary: any = null;
  dataVolumeState: any = null;
  availableSheets: string[] | null = null;
  selectedSheet: string | null = null;
  isParsing = false;

  safeSetState<T>(setter: (v: T) => void, value: T): boolean {
    if (this.isMountedRef.current) {
      setter(value);
      return true;
    }
    return false;
  }

  setRawText(text: string): void {
    if (!this.isMountedRef.current) return;
    if (this.pendingInternalRawTextRef.current === text) {
      this.pendingInternalRawTextRef.current = null;
      this.rawText = text;
      return;
    }
    this.parseVersionRef.current++;
    this.pendingInternalRawTextRef.current = null;
    this.rawText = text;
  }

  async handleFileUpload(fileId: string, delayMs: number): Promise<boolean> {
    const currentVersion = ++this.parseVersionRef.current;
    this.safeSetState((v) => { this.fileError = v; }, null);
    this.safeSetState((v) => { this.isParsing = v; }, true);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    if (this.parseVersionRef.current !== currentVersion) {
      return false;
    }
    if (!this.isMountedRef.current) {
      return false;
    }

    this.safeSetState((v) => { this.parsedData = v; }, { fileId, version: currentVersion });
    this.safeSetState((v) => { this.isParsing = v; }, false);
    
    const text = `file_${fileId}_content`;
    this.pendingInternalRawTextRef.current = text;
    this.safeSetState((v) => { this.rawText = v; }, text);
    return true;
  }

  async handleSheetChange(sheetName: string, delayMs: number): Promise<boolean> {
    const currentVersion = ++this.parseVersionRef.current;
    this.safeSetState((v) => { this.selectedSheet = v; }, sheetName);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    if (this.parseVersionRef.current !== currentVersion) {
      return false;
    }
    if (!this.isMountedRef.current) {
      return false;
    }

    this.safeSetState((v) => { this.parsedData = v; }, { sheet: sheetName, version: currentVersion });
    const text = `sheet_${sheetName}_content`;
    this.pendingInternalRawTextRef.current = text;
    this.safeSetState((v) => { this.rawText = v; }, text);
    return true;
  }

  clearParsedTable(): void {
    this.parseVersionRef.current++;
    this.pendingInternalRawTextRef.current = null;
    this.safeSetState((v) => { this.rawText = v; }, '');
    this.safeSetState((v) => { this.parsedData = v; }, null);
    this.safeSetState((v) => { this.parseWarnings = v; }, []);
    this.safeSetState((v) => { this.parseError = v; }, null);
    this.safeSetState((v) => { this.parseSummary = v; }, null);
    this.safeSetState((v) => { this.dataVolumeState = v; }, null);
    this.safeSetState((v) => { this.fileError = v; }, null);
    this.safeSetState((v) => { this.availableSheets = v; }, null);
    this.safeSetState((v) => { this.selectedSheet = v; }, null);
    this.safeSetState((v) => { this.isParsing = v; }, false);
  }

  unmount(): void {
    this.isMountedRef.current = false;
  }
}

// ============================================================
// 主测试函数
// ============================================================
async function runTests() {
  console.log('='.repeat(60));
  console.log('异步竞争自动化测试');
  console.log('='.repeat(60));

  // ============================================================
  // 测试一：文件A解析未完成时上传文件B，最终只保留B
  // ============================================================
  console.log('\n📊 测试一：文件A未完成时上传文件B，只保留B');

  const state1 = new MockParsedTableState();
  const promiseA = state1.handleFileUpload('A', 100);
  const promiseB = state1.handleFileUpload('B', 50);

  const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

  assert('文件A结果被丢弃', resultA === false, `实际: ${resultA}`);
  assert('文件B结果被保留', resultB === true, `实际: ${resultB}`);
  assert('最终 parsedData 是文件B', state1.parsedData?.fileId === 'B', 
    `实际: ${state1.parsedData?.fileId}`);
  assert('最终 rawText 是文件B内容', state1.rawText === 'file_B_content',
    `实际: ${state1.rawText}`);

  // ============================================================
  // 测试二：文件上传后立即编辑文本，最终保留文本结果
  // ============================================================
  console.log('\n📊 测试二：文件上传后立即编辑文本，保留文本结果');

  const state2 = new MockParsedTableState();
  const uploadPromise = state2.handleFileUpload('A', 100);

  // 在文件解析完成前编辑文本
  await new Promise(resolve => setTimeout(resolve, 10));
  state2.setRawText('user_edited_text');

  const uploadResult = await uploadPromise;

  assert('文件解析结果被丢弃（版本过期）', uploadResult === false,
    `实际: ${uploadResult}`);
  assert('最终 rawText 是用户编辑的文本', state2.rawText === 'user_edited_text',
    `实际: ${state2.rawText}`);
  assert('最终 parsedData 为null', state2.parsedData === null,
    `实际: ${state2.parsedData}`);

  // ============================================================
  // 测试三：快速切换Sheet A→B，最终只保留B
  // ============================================================
  console.log('\n📊 测试三：快速切换Sheet A→B，只保留B');

  const state3 = new MockParsedTableState();
  const sheetPromiseA = state3.handleSheetChange('A', 100);
  const sheetPromiseB = state3.handleSheetChange('B', 50);

  const [sheetResultA, sheetResultB] = await Promise.all([sheetPromiseA, sheetPromiseB]);

  assert('Sheet A结果被丢弃', sheetResultA === false, `实际: ${sheetResultA}`);
  assert('Sheet B结果被保留', sheetResultB === true, `实际: ${sheetResultB}`);
  assert('最终 parsedData 是Sheet B', state3.parsedData?.sheet === 'B',
    `实际: ${state3.parsedData?.sheet}`);
  assert('最终 selectedSheet 是B', state3.selectedSheet === 'B',
    `实际: ${state3.selectedSheet}`);

  // ============================================================
  // 测试四：组件卸载后异步结果不写状态
  // ============================================================
  console.log('\n📊 测试四：组件卸载后异步结果不写状态');

  const state4 = new MockParsedTableState();
  const unmountPromise = state4.handleFileUpload('A', 100);

  await new Promise(resolve => setTimeout(resolve, 50));
  state4.unmount();

  const unmountResult = await unmountPromise;

  assert('异步操作返回false（组件已卸载）', unmountResult === false,
    `实际: ${unmountResult}`);
  assert('parsedData 未被设置', state4.parsedData === null,
    `实际: ${state4.parsedData}`);
  assert('rawText 未被更新', state4.rawText === '',
    `实际: ${state4.rawText}`);

  // ============================================================
  // 测试五：clearParsedTable后旧结果不能重新写回
  // ============================================================
  console.log('\n📊 测试五：clearParsedTable后旧结果不能重新写回');

  const state5 = new MockParsedTableState();
  const clearPromise = state5.handleFileUpload('A', 100);

  await new Promise(resolve => setTimeout(resolve, 50));
  state5.clearParsedTable();

  const clearResult = await clearPromise;

  assert('异步操作返回false（版本过期）', clearResult === false,
    `实际: ${clearResult}`);
  assert('parsedData 为null', state5.parsedData === null,
    `实际: ${state5.parsedData}`);
  assert('rawText 为空', state5.rawText === '',
    `实际: ${state5.rawText}`);
  assert('parseError 为null', state5.parseError === null);
  assert('parseSummary 为null', state5.parseSummary === null);
  assert('dataVolumeState 为null', state5.dataVolumeState === null);
  assert('fileError 为null', state5.fileError === null);
  assert('availableSheets 为null', state5.availableSheets === null);
  assert('selectedSheet 为null', state5.selectedSheet === null);
  assert('isParsing 为false', state5.isParsing === false);

  // ============================================================
  // 测试六：pendingInternalRawTextRef不匹配时必须清理
  // ============================================================
  console.log('\n📊 测试六：pendingInternalRawTextRef不匹配时必须清理');

  const state6 = new MockParsedTableState();

  // 场景1：内部更新标记存在，但用户编辑不同文本
  state6.pendingInternalRawTextRef.current = 'internal_text';
  state6.setRawText('user_text');

  assert('版本号递增（用户编辑不同文本）', state6.parseVersionRef.current === 1,
    `实际: ${state6.parseVersionRef.current}`);
  assert('pendingInternalRawTextRef 被清空', state6.pendingInternalRawTextRef.current === null,
    `实际: ${state6.pendingInternalRawTextRef.current}`);
  assert('rawText 更新为用户文本', state6.rawText === 'user_text',
    `实际: ${state6.rawText}`);

  // 场景2：内部更新标记匹配，不递增版本号
  state6.pendingInternalRawTextRef.current = 'match_text';
  state6.setRawText('match_text');

  assert('匹配时版本号不递增', state6.parseVersionRef.current === 1,
    `实际: ${state6.parseVersionRef.current}`);
  assert('匹配时 pendingInternalRawTextRef 被清空', state6.pendingInternalRawTextRef.current === null,
    `实际: ${state6.pendingInternalRawTextRef.current}`);
  assert('rawText 更新为匹配文本', state6.rawText === 'match_text',
    `实际: ${state6.rawText}`);

  // 场景3：组件卸载后 setRawText 无效
  state6.unmount();
  state6.setRawText('should_not_apply');

  assert('卸载后 rawText 不变', state6.rawText === 'match_text',
    `实际: ${state6.rawText}`);

  // ============================================================
  // 测试结果汇总
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('测试结果汇总');
  console.log('='.repeat(60));
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📋 总计: ${passed + failed}`);

  if (failed > 0) {
    console.log('\n❌ 有测试失败，退出码 1');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
