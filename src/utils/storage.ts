import type { SavedState } from '../types';

const STORAGE_KEY = 'score_analyzer_state';
const CURRENT_VERSION = 1;

export const DEFAULT_TRADITIONAL_ENTRIES = [
  { name: '语文', score: 110, maxScore: 150 },
  { name: '数学', score: 94, maxScore: 150 },
  { name: '外语', score: 117, maxScore: 150 },
  { name: '物理', score: 31, maxScore: 100 },
  { name: '化学', score: 78, maxScore: 100 },
  { name: '生物', score: 84, maxScore: 100 },
];

export const DEFAULT_SAMPLE_TEXT = `名次\t总分\t语文数学两科之和\t语文或数学单科最高成绩\t外语单科成绩\t首选科目单科成绩\t再选科目单科最高成绩\t再选科目单科次高成绩
1\t680\t290\t150\t135\t92\t88\t85
2\t673\t285\t148\t132\t90\t87\t83
3\t668\t282\t146\t130\t88\t86\t82
4\t665\t280\t145\t129\t87\t85\t81
5\t662\t278\t144\t128\t86\t84\t80
6\t658\t276\t143\t127\t85\t83\t79
7\t655\t274\t142\t126\t84\t82\t78
8\t652\t272\t141\t125\t83\t81\t77
9\t649\t270\t140\t124\t82\t80\t76
10\t645\t268\t139\t123\t81\t79\t75
11\t642\t266\t138\t122\t80\t78\t74
12\t639\t264\t137\t121\t79\t77\t73
13\t636\t262\t136\t120\t78\t76\t72
14\t633\t260\t135\t119\t77\t75\t71
15\t630\t258\t134\t118\t76\t74\t70
16\t627\t256\t133\t117\t75\t73\t69
17\t624\t254\t132\t116\t74\t72\t68
18\t621\t252\t131\t115\t73\t71\t67
19\t618\t250\t130\t114\t72\t70\t66
20\t615\t248\t129\t113\t71\t69\t65
21\t612\t246\t128\t112\t70\t68\t64
22\t609\t244\t127\t111\t69\t67\t63
23\t606\t242\t126\t110\t68\t66\t62
24\t603\t240\t125\t109\t67\t65\t61
25\t600\t238\t124\t108\t66\t64\t60
26\t597\t236\t123\t107\t65\t63\t59
27\t594\t234\t122\t106\t64\t62\t58
28\t591\t232\t121\t105\t63\t61\t57
29\t588\t230\t120\t104\t62\t60\t56
30\t585\t228\t119\t103\t61\t59\t55
31\t582\t226\t118\t102\t60\t58\t54
32\t579\t224\t117\t101\t59\t57\t53
33\t576\t222\t116\t100\t58\t56\t52
34\t573\t220\t115\t99\t57\t55\t51
35\t570\t218\t114\t98\t56\t54\t50
36\t567\t216\t113\t97\t55\t53\t49
37\t564\t214\t112\t96\t54\t52\t48
38\t561\t212\t111\t95\t53\t51\t47
39\t558\t210\t110\t94\t52\t50\t46
40\t555\t208\t109\t93\t51\t49\t45
41\t552\t206\t108\t92\t50\t48\t44
42\t549\t204\t107\t91\t49\t47\t43
43\t546\t202\t106\t90\t48\t46\t42
44\t543\t200\t105\t89\t47\t45\t41
45\t540\t198\t104\t88\t46\t44\t40
46\t537\t196\t103\t87\t45\t43\t39
47\t534\t194\t102\t86\t44\t42\t38
48\t531\t192\t101\t85\t43\t41\t37
49\t528\t190\t100\t84\t42\t40\t36
50\t525\t188\t99\t83\t41\t39\t35`;

/** 系统默认状态：用于"恢复默认"和"填入示例数据" */
export function getSystemDefaultState(): SavedState {
  return {
    version: CURRENT_VERSION,
    rawText: DEFAULT_SAMPLE_TEXT,
    selectedField: '外语单科成绩',
    inputValue: '117',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    traditionalSubjectRadar: { entries: DEFAULT_TRADITIONAL_ENTRIES },
    analysisMode: 'scoreRate',
  };
}

/** 空白默认状态：用于首次加载或 localStorage 为空时 */
export function getDefaultState(): SavedState {
  return {
    version: CURRENT_VERSION,
    rawText: '',
    selectedField: '',
    inputValue: '',
    showAllFields: false,
    activeChartTab: 'histogram',
    originalFieldRadar: { selections: [], viewMode: 'bar' },
    traditionalSubjectRadar: { entries: [] },
    analysisMode: 'scoreRate',
  };
}

/** 安全的 JSON 解析，失败时返回默认值 */
export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveState(state: SavedState): void {
  try {
    const toSave = { ...state, version: CURRENT_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadSavedState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = safeJsonParse<SavedState>(raw, getDefaultState());
    if (typeof parsed !== 'object' || parsed === null) return getDefaultState();
    if (parsed.version !== CURRENT_VERSION) return getDefaultState();
    return parsed;
  } catch {
    return getDefaultState();
  }
}

export function clearSavedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默失败
  }
}
