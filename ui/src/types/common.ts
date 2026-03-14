export type DataSourceMode = 'mock' | 'api';
export type RequestErrorKind = 'timeout' | 'network' | 'http' | 'biz' | 'unknown';

export interface BizResponse<T> {
  code: number;
  success?: boolean;
  message?: string;
  msg?: string;
  data?: T;
  timestamp?: number;
}

export interface TransportFetchResult<T> {
  data: T;
  sourceUsed: DataSourceMode;
  warning?: string;
}

export interface RequestErrorInfo {
  kind: RequestErrorKind;
  message: string;
  status?: number;
  bizCode?: number;
}

export interface UiCapabilities {
  showDataSourceSwitch: boolean;
  showQueryInspector: boolean;
}

export type TimeRangeId = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';
export type RuntimeTimeRangeId = Exclude<TimeRangeId, '30d'>;

export interface TimeRangeOption<T extends string = TimeRangeId> {
  id: T;
  label: string;
  milliseconds: number;
}
