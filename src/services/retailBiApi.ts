/**
 * 零售 BI API 客户端。
 *
 * 作用：
 * 1. 封装与 Spring Boot 零售指标 API 的通信；
 * 2. 负责请求地址拼接和响应检查；
 * 3. 在请求失败时保留后端 message 和 requestId；
 * 4. 向上层返回强类型销售趋势数据。
 */

import type {
  ApiResponse,
  RetailBiConnectionConfig,
  SalesAnomalyVO,
  SalesOverviewComparisonVO,
  SalesOverviewRow,
  SalesOverviewVO,
} from '../types/retailBi';

/**
 * 零售 BI API 调用异常。
 */
export class RetailBiApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'RetailBiApiError';
  }
}

/**
 * 获取默认零售 BI API 地址。
 *
 * 仅读取显式环境变量，不返回任何默认地址。
 */
export function getDefaultRetailBiBaseUrl(): string {
  return import.meta.env.VITE_RETAIL_BI_API_BASE_URL?.trim() || '';
}

/**
 * 处理用户填写的基础地址。
 *
 * 优先使用用户输入地址；其次使用显式环境变量；
 * 两者均为空时抛出异常，不得发起网络请求。
 */
function resolveBaseUrl(baseUrl: string): string {
  const userUrl = baseUrl.trim();
  if (userUrl) {
    return userUrl;
  }

  const envUrl = getDefaultRetailBiBaseUrl();
  if (envUrl) {
    return envUrl;
  }

  throw new RetailBiApiError('请输入 API 基础地址');
}

/**
 * 尝试解析后端统一响应。
 *
 * HTTP 非 2xx 时后端仍可能返回合法 JSON，
 * 因此不能在解析响应体之前直接抛出异常。
 */
async function parseApiResponse<T>(
  response: Response,
): Promise<ApiResponse<T> | null> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return null;
  }
}

/**
 * 查询指定日期范围内的销售趋势数据。
 */
export async function fetchSalesTrend(
  config: RetailBiConnectionConfig,
): Promise<SalesOverviewRow[]> {
  const baseUrl = resolveBaseUrl(config.baseUrl);

  let url: URL;

  try {
    url = new URL(
      '/api/v1/dashboard/overview/trend',
      baseUrl,
    );
  } catch {
    throw new RetailBiApiError(
      'API 基础地址格式不正确，请检查后重新输入',
    );
  }

  url.searchParams.set('startDate', config.startDate);
  url.searchParams.set('endDate', config.endDate);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : '未知网络错误';

    throw new RetailBiApiError(
      `无法连接零售 BI 服务：${detail}`,
    );
  }

  const apiResponse =
    await parseApiResponse<SalesOverviewRow[]>(response);

  const requestId =
    apiResponse?.requestId
    || response.headers.get('X-Request-Id')
    || undefined;

  if (!response.ok) {
    throw new RetailBiApiError(
      apiResponse?.message
      || `请求失败，HTTP 状态码：${response.status}`,
      response.status,
      requestId,
    );
  }

  if (apiResponse === null) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的内容不是有效 JSON',
      response.status,
      requestId,
    );
  }

  if (apiResponse.code !== 200) {
    throw new RetailBiApiError(
      apiResponse.message || '零售 BI 服务返回业务错误',
      apiResponse.code,
      requestId,
    );
  }

  if (apiResponse.data === null) {
    return [];
  }

  if (!Array.isArray(apiResponse.data)) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的数据格式不正确',
      apiResponse.code,
      requestId,
    );
  }

  return apiResponse.data;
}

/**
 * 查询指定日期的单日销售概览数据。
 */
export async function fetchSalesOverview(
  baseUrl: string,
  date: string,
): Promise<SalesOverviewVO> {
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);

  let url: URL;

  try {
    url = new URL(
      '/api/v1/dashboard/overview',
      resolvedBaseUrl,
    );
  } catch {
    throw new RetailBiApiError(
      'API 基础地址格式不正确，请检查后重新输入',
    );
  }

  url.searchParams.set('date', date);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : '未知网络错误';

    throw new RetailBiApiError(
      `无法连接零售 BI 服务：${detail}`,
    );
  }

  const apiResponse =
    await parseApiResponse<SalesOverviewVO>(response);

  const requestId =
    apiResponse?.requestId
    || response.headers.get('X-Request-Id')
    || undefined;

  if (!response.ok) {
    throw new RetailBiApiError(
      apiResponse?.message
      || `请求失败，HTTP 状态码：${response.status}`,
      response.status,
      requestId,
    );
  }

  if (apiResponse === null) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的内容不是有效 JSON',
      response.status,
      requestId,
    );
  }

  if (apiResponse.code !== 200) {
    throw new RetailBiApiError(
      apiResponse.message || '零售 BI 服务返回业务错误',
      apiResponse.code,
      requestId,
    );
  }

  if (apiResponse.data === null) {
    throw new RetailBiApiError(
      '零售 BI 服务未返回数据',
      apiResponse.code,
      requestId,
    );
  }

  return apiResponse.data;
}

/**
 * 查询指定日期的销售概览日环比数据。
 */
export async function fetchSalesComparison(
  baseUrl: string,
  date: string,
): Promise<SalesOverviewComparisonVO> {
  const resolvedBaseUrl = resolveBaseUrl(baseUrl);

  let url: URL;

  try {
    url = new URL(
      '/api/v1/dashboard/overview/comparison',
      resolvedBaseUrl,
    );
  } catch {
    throw new RetailBiApiError(
      'API 基础地址格式不正确，请检查后重新输入',
    );
  }

  url.searchParams.set('date', date);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : '未知网络错误';

    throw new RetailBiApiError(
      `无法连接零售 BI 服务：${detail}`,
    );
  }

  const apiResponse =
    await parseApiResponse<SalesOverviewComparisonVO>(response);

  const requestId =
    apiResponse?.requestId
    || response.headers.get('X-Request-Id')
    || undefined;

  if (!response.ok) {
    throw new RetailBiApiError(
      apiResponse?.message
      || `请求失败，HTTP 状态码：${response.status}`,
      response.status,
      requestId,
    );
  }

  if (apiResponse === null) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的内容不是有效 JSON',
      response.status,
      requestId,
    );
  }

  if (apiResponse.code !== 200) {
    throw new RetailBiApiError(
      apiResponse.message || '零售 BI 服务返回业务错误',
      apiResponse.code,
      requestId,
    );
  }

  if (apiResponse.data === null) {
    throw new RetailBiApiError(
      '零售 BI 服务未返回数据',
      apiResponse.code,
      requestId,
    );
  }

  return apiResponse.data;
}


/**
 * 查询指定日期范围内的经营异常数据。
 *
 * 后端当前返回 MEDIUM / HIGH 异常；无异常时返回空数组。
 */
export async function fetchSalesAnomalies(
  config: RetailBiConnectionConfig,
): Promise<SalesAnomalyVO[]> {
  const baseUrl = resolveBaseUrl(config.baseUrl);

  let url: URL;

  try {
    url = new URL(
      '/api/v1/dashboard/anomalies',
      baseUrl,
    );
  } catch {
    throw new RetailBiApiError(
      'API 基础地址格式不正确，请检查后重新输入',
    );
  }

  url.searchParams.set('startDate', config.startDate);
  url.searchParams.set('endDate', config.endDate);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : '未知网络错误';

    throw new RetailBiApiError(
      `无法连接零售 BI 服务：${detail}`,
    );
  }

  const apiResponse =
    await parseApiResponse<SalesAnomalyVO[]>(response);

  const requestId =
    apiResponse?.requestId
    || response.headers.get('X-Request-Id')
    || undefined;

  if (!response.ok) {
    throw new RetailBiApiError(
      apiResponse?.message
      || `请求失败，HTTP 状态码：${response.status}`,
      response.status,
      requestId,
    );
  }

  if (apiResponse === null) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的内容不是有效 JSON',
      response.status,
      requestId,
    );
  }

  if (apiResponse.code !== 200) {
    throw new RetailBiApiError(
      apiResponse.message || '零售 BI 服务返回业务错误',
      apiResponse.code,
      requestId,
    );
  }

  if (apiResponse.data === null) {
    return [];
  }

  if (!Array.isArray(apiResponse.data)) {
    throw new RetailBiApiError(
      '零售 BI 服务返回的数据格式不正确',
      apiResponse.code,
      requestId,
    );
  }

  return apiResponse.data;
}
