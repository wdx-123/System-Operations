import type { DataSourceMode, RuntimeTimeRangeId } from './common';
import type {
  EventRuntimeStatus,
  OutboxRuntimeStatus,
  RuntimeQueryData,
  RuntimeQueryReq,
  TaskRuntimeStatus,
} from './runtime';

export interface RuntimePageFilters {
  range_id: RuntimeTimeRangeId;
  task_name: string;
  task_status: TaskRuntimeStatus;
  topic: string;
  event_status: EventRuntimeStatus;
}

export type RuntimeDashboardMetricKey =
  | 'taskExecution'
  | 'taskDuration'
  | 'publishDuration'
  | 'consumeTotal'
  | 'consumeDuration'
  | 'outboxSnapshot'
  | 'outboxPublished'
  | 'outboxFailed';

export interface RuntimeMetricResult {
  request: RuntimeQueryReq;
  response: RuntimeQueryData;
  sourceUsed: DataSourceMode;
  warning?: string;
}

export type { OutboxRuntimeStatus };
