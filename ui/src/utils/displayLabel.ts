import type { DataSourceMode, RequestErrorInfo } from '../types/common';
import type { EventRuntimeStatus, OutboxRuntimeStatus, TaskRuntimeStatus } from '../types/runtime';
import type { TraceDetailSource, TraceRootStage, TraceStatus } from '../types/tracing';

const SERVICE_ALIAS: Record<string, string> = {
  gateway: '网关',
  'user-service': '用户服务',
  'order-service': '订单服务',
  'payment-service': '支付服务',
  'report-service': '报表服务',
  'ranking-service': '榜单服务',
  'notification-service': '通知服务',
  'messaging-service': '消息服务',
  'mysql-cluster': 'MySQL 集群',
  'redis-cluster': 'Redis 集群',
};

const TOPIC_ALIAS: Record<string, string> = {
  'user.activity': '用户行为事件',
  'billing.events': '账单事件',
  'ranking.refresh': '榜单刷新事件',
};

export function toDataSourceLabel(source: DataSourceMode): string {
  return source === 'api' ? '实时数据' : '模拟数据';
}

export function toTraceStatusLabel(status: TraceStatus | 'ok' | 'error'): string {
  if (status === 'error') return '失败';
  if (status === 'ok') return '成功';
  return '全部状态';
}

export function toTraceRootStageLabel(stage: TraceRootStage): string {
  if (stage === 'http.request') return 'HTTP 请求';
  if (stage === 'task') return '定时任务';
  return '全部根类型';
}

export function toTraceIdTypeLabel(source: TraceDetailSource): string {
  return source === 'trace' ? 'Trace ID' : 'Request ID';
}

export function toTaskStatusLabel(status: TaskRuntimeStatus): string {
  if (!status) return '全部状态';
  if (status === 'success') return '成功';
  if (status === 'error') return '失败';
  return '跳过';
}

export function toEventStatusLabel(status: EventRuntimeStatus): string {
  if (!status) return '全部状态';
  return status === 'success' ? '成功' : '失败';
}

export function toOutboxStatusLabel(status: OutboxRuntimeStatus): string {
  if (!status) return '全部状态';
  if (status === 'published') return '已发布';
  if (status === 'failed') return '失败';
  return '待处理';
}

export function toServiceDisplayLabel(value: string): string {
  const alias = SERVICE_ALIAS[value];
  return alias ? `${alias}（${value}）` : value;
}

export function toTopicDisplayLabel(value: string): string {
  const alias = TOPIC_ALIAS[value];
  return alias ? `${alias}（${value}）` : value;
}

export function toRequestErrorDisplayMessage(error: RequestErrorInfo, label: string): string {
  if (error.kind === 'timeout') {
    return `${label} 请求超时，已回退为模拟数据。`;
  }
  if (error.kind === 'network') {
    return `${label} 网络异常，已回退为模拟数据。`;
  }
  if (error.kind === 'http') {
    const statusPart = error.status ? `（HTTP ${error.status}）` : '';
    if (error.status === 401 || error.status === 403) {
      return `${label} 鉴权失败${statusPart}，已回退为模拟数据。`;
    }
    return `${label} 接口请求失败${statusPart}，已回退为模拟数据。`;
  }
  if (error.kind === 'biz') {
    const codePart = Number.isFinite(error.bizCode) ? `（业务码 ${error.bizCode}）` : '';
    return `${label} 业务返回失败${codePart}，已回退为模拟数据。`;
  }
  return `${label} 请求异常，已回退为模拟数据。`;
}
