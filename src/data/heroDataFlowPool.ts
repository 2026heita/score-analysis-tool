/**
 * Hero 数据流候选池
 * 
 * 职责：为 12 个数据流展示槽位提供专业文本候选池
 * 设计原则：
 * 1. 每个槽位对应特定学科领域
 * 2. 使用固定候选池，不动态生成公式
 * 3. 页面加载时随机选择，运行期间保持稳定
 * 4. 使用 crypto.getRandomValues() 实现安全随机
 */

// 12 个学科领域的类型定义
export type HeroDataFlowCategory = 
  | 'computerBasics' 
  | 'statistics' 
  | 'dataStatistics' 
  | 'estimation' 
  | 'dataEngineering' 
  | 'mathematics' 
  | 'probability' 
  | 'algorithms' 
  | 'linearAlgebra' 
  | 'machineLearning' 
  | 'informationTheory' 
  | 'optimization';

// 12 个学科领域的候选池
export const heroDataFlowPools: Record<HeroDataFlowCategory, string[]> = {
  computerBasics: [
    '42₁₀ = 101010₂',
    '65₁₀ = 01000001₂',
    'FF₁₆ = 255₁₀',
    '1 byte = 8 bits',
    'UTF-8 bytes→Unicode code point',
    '0101 XOR 0011 = 0110',
    '2¹⁰ bytes = 1 KiB',
    '0x1F = 31₁₀'
  ],
  
  statistics: [
    '95% CI=[0.84, 0.90]',
    'p=0.032 < 0.05',
    'SE=s/√n',
    't=(x̄−μ₀)/(s/√n)',
    '95% CI≈x̄±1.96·SE',
    'α=0.05 · power=0.80',
    'χ²=Σ(O−E)²/E',
    's²=Σ(xᵢ−x̄)²/(n−1)'
  ],
  
  dataStatistics: [
    'x̄=Σxᵢ/n · z=(x−μ)/σ',
    'σ²=Σ(xᵢ−μ)²/n',
    'CV=σ/μ×100%',
    'IQR=Q₃−Q₁',
    'skew=E[(X−μ)³]/σ³',
    'kurt=E[(X−μ)⁴]/σ⁴',
    'ρ=cov(X,Y)/(σₓσᵧ)',
    'R²=1−SSE/SST'
  ],
  
  estimation: [
    'μ̂=x̄ · σ̂²=Σ(xᵢ−x̄)²/n',
    'SE(x̄)=s/√n',
    'θ̂=argmax L(θ|X)',
    'MLE: ∂lnL/∂θ=0',
    'Bayes: P(θ|X)∝P(X|θ)P(θ)',
    'MSE=Σ(ŷᵢ−yᵢ)²/n',
    'MSE=Bias²+Variance+σ²',
    'n=(z·σ/E)²'
  ],
  
  dataEngineering: [
    'ETL: extract→transform→load',
    'OLAP: aggregate · OLTP: transact',
    'Star schema: fact+dim',
    'date partition→scan pruning',
    'Index: B+tree · hash',
    'JOIN: inner · left · full',
    'Window: ROW_NUMBER()',
    'ACID: atomic·consistent·isolated·durable'
  ],
  
  mathematics: [
    '∫₀¹ x²dx = 1/3',
    'limₙ→∞(1+1/n)ⁿ=e',
    '∇f=(∂f/∂x, ∂f/∂y)',
    '∑ₖ₌₁ⁿ k = n(n+1)/2',
    'e^(iπ)+1=0',
    'ln(ab)=ln a+ln b',
    'sin²θ+cos²θ=1',
    'd/dx eˣ=eˣ'
  ],
  
  probability: [
    'P(A|B)=P(B|A)P(A)/P(B)',
    'E[X]=Σxᵢpᵢ',
    'Var(X)=E[X²]−(E[X])²',
    'X~N(μ,σ²)',
    'P(A∪B)=P(A)+P(B)−P(A∩B)',
    'Cov(X,Y)=E[XY]−E[X]E[Y]',
    'Binom(n,p): C(n,k)pᵏ(1−p)ⁿ⁻ᵏ',
    'Poisson: λᵏe⁻λ/k!'
  ],
  
  algorithms: [
    'merge sort: O(n log n)',
    'DP: optimal substructure',
    'BFS: queue · DFS: stack',
    'Binary search: O(log n)',
    'Quick sort: avg O(n log n)',
    'Dijkstra: O((V+E)log V)',
    'Tree: AVL · Red-Black',
    'Memoization: top-down DP'
  ],
  
  linearAlgebra: [
    'det(A−λI)=0 · Av=λv',
    'A=UΣVᵀ (SVD)',
    'rank(A)=dim(col(A))',
    'A⁻¹A=I · det(AB)=det(A)det(B)',
    'tr(A)=Σaᵢᵢ',
    '‖v‖=√(vᵀv)',
    'u·v=‖u‖‖v‖cosθ',
    'projᵤv=(u·v/‖u‖²)u'
  ],
  
  machineLearning: [
    'ŷ=β₀+βᵀx · R²=1−SSE/SST',
    'L(w)=Σ(yᵢ−wᵀxᵢ)²',
    'SVM: max margin · kernel',
    'RF: bagging+feature subset',
    'k-NN: distance weighted',
    'CNN: conv+pool+fc',
    'RNN: hₜ=f(hₜ₋₁,xₜ)',
    'Attention=softmax(QKᵀ/√dₖ)V'
  ],
  
  informationTheory: [
    'H(X)=−Σpᵢlog₂pᵢ',
    'Dₖₗ(P‖Q)=Σpᵢlog(pᵢ/qᵢ)',
    'I(X;Y)=H(X)−H(X|Y)',
    'Channel: C=max I(X;Y)',
    'Huffman: prefix code',
    'Lempel-Ziv: dictionary',
    'Shannon: C=B log₂(1+S/N)',
    'H̄(X)=limₙ→∞H(X₁,…,Xₙ)/n'
  ],
  
  optimization: [
    'θ←θ−η∇L(θ) · ε=10⁻⁶',
    'Adam: mₜ,vₜ adaptive',
    'SGD: mini-batch · momentum',
    'Convex: ∇²f⪰0',
    'Lagrange: L=f+λg',
    'KKT: ∇ₓL=0 · λ≥0 · λg=0',
    '‖∇f(x)−∇f(y)‖≤L‖x−y‖',
    'CG: xₖ₊₁=xₖ+αₖpₖ'
  ]
};

// 12 个槽位与学科领域的对应关系
export const slotCategoryMap: Record<number, HeroDataFlowCategory> = {
  1: 'computerBasics',
  2: 'statistics',
  3: 'dataStatistics',
  4: 'estimation',
  5: 'dataEngineering',
  6: 'mathematics',
  7: 'probability',
  8: 'algorithms',
  9: 'linearAlgebra',
  10: 'machineLearning',
  11: 'informationTheory',
  12: 'optimization'
};

/**
 * 使用 crypto.getRandomValues() 生成安全随机索引
 * 如果环境不支持 crypto，则降级到 Math.random()
 */
function getRandomIndex(length: number): number {
  if (length <= 1) return 0;
  
  // 优先使用 globalThis.crypto 避免兼容问题
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(1);
    cryptoObj.getRandomValues(arr);
    return arr[0] % length;
  } else {
    // 降级方案：仅在 crypto 不可用时执行
    if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
      console.warn('crypto.getRandomValues not available, falling back to Math.random()');
    }
    return Math.floor(Math.random() * length);
  }
}

/**
 * 为 12 个槽位各选择一个候选文本
 * 返回固定长度为 12 的字符串数组
 * 
 * 设计要点：
 * 1. 每个槽位从对应学科候选池中随机选择一条
 * 2. 选择结果在页面加载时确定，运行期间保持不变
 * 3. 使用惰性初始化确保组件重渲染时不会重新选择
 * 4. 空候选池时抛出明确错误，不静默生成空字符串
 */
export function createHeroDataFlowSelection(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const slotNumber = i + 1;
    const category = slotCategoryMap[slotNumber];
    const pool = heroDataFlowPools[category];
    
    // 空候选池防御：明确抛出错误
    if (!pool || pool.length === 0) {
      throw new Error(
        `Hero data flow pool "${category}" must contain at least one candidate.`
      );
    }
    
    const randomIndex = getRandomIndex(pool.length);
    return pool[randomIndex];
  });
}
