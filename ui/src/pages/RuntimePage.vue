<template>
  <section class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t.app.nav.runtime }}</p>
        <h2>{{ t.runtime.title }}</h2>
        <p class="desc">{{ t.runtime.desc }}</p>
      </div>
      <div class="header-meta">
        <span class="meta-pill">数据来源：{{ sourceSummaryLabel }}</span>
        <span class="meta-pill">{{ autoRefreshSeconds === 0 ? '手动刷新' : `${autoRefreshSeconds}s 自动刷新` }}</span>
      </div>
    </header>

    <section class="toolbar-card">
      <div class="toolbar-row">
        <label class="field">
          <span>时间范围</span>
          <select v-model="filters.range_id" aria-label="运行时时间范围">
            <option v-for="item in RUNTIME_TIME_RANGE_OPTIONS" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>

        <label class="field">
          <span>自动刷新</span>
          <select v-model.number="autoRefreshSeconds" aria-label="自动刷新间隔">
            <option v-for="option in autoRefreshOptions" :key="option" :value="option">
              {{ option === 0 ? '关闭' : `${option} 秒` }}
            </option>
          </select>
        </label>

        <div class="toolbar-actions">
          <button class="primary-btn" :disabled="loading" aria-label="刷新运行时数据" @click="manualRefresh">
            {{ loading ? '加载中...' : '立即刷新' }}
          </button>
        </div>
      </div>
    </section>

    <p v-if="warningMessage" class="notice warning">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="notice error">{{ errorMessage }}</p>

    <section class="panel-card">
      <header class="section-head">
        <div>
          <h3>任务运行态</h3>
          <p>执行总数与耗时面板，支持任务名和状态过滤。</p>
        </div>
        <div class="section-filters">
          <label class="field compact">
            <span>任务名</span>
            <select v-model="filters.task_name" aria-label="任务名筛选">
              <option value="">全部</option>
              <option v-for="name in taskNameOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
          <label class="field compact">
            <span>状态</span>
            <select v-model="filters.task_status" aria-label="任务状态筛选">
              <option value="">全部</option>
              <option value="success">{{ toTaskStatusLabel('success') }}</option>
              <option value="error">{{ toTaskStatusLabel('error') }}</option>
              <option value="skipped">{{ toTaskStatusLabel('skipped') }}</option>
            </select>
          </label>
        </div>
      </header>

      <section class="stats-grid">
        <ConsoleStatCard label="任务总数" :value="formatCompact(taskSummary.total)" />
        <ConsoleStatCard label="成功数" :value="formatCompact(taskSummary.success_total)" tone="good" />
        <ConsoleStatCard label="失败数" :value="formatCompact(taskSummary.error_total)" tone="danger" />
        <ConsoleStatCard label="跳过数" :value="formatCompact(taskSummary.skipped_total)" tone="warn" />
      </section>

      <section class="charts-grid">
        <LineChartCard
          title="任务执行总量"
          subtitle="按成功 / 失败 / 跳过拆分"
          :labels="taskExecutionLabels"
          :series="taskExecutionSeries"
          :loading="loading && !dashboard"
        />
        <LineChartCard
          title="任务执行耗时"
          subtitle="按时间桶聚合平均与最大耗时"
          :labels="taskDurationLabels"
          :series="taskDurationSeries"
          :loading="loading && !dashboard"
          unit=" ms"
          :decimals="1"
        />
      </section>
    </section>

    <section class="panel-card">
      <header class="section-head">
        <div>
          <h3>事件管道</h3>
          <p>覆盖发布耗时、消费总量、消费耗时。</p>
        </div>
        <div class="section-filters">
          <label class="field compact">
            <span>主题（Topic）</span>
            <select v-model="filters.topic" aria-label="Topic 筛选">
              <option value="">全部</option>
              <option v-for="topic in topicOptions" :key="topic" :value="topic">{{ toTopicDisplayLabel(topic) }}</option>
            </select>
          </label>
          <label class="field compact">
            <span>状态</span>
            <select v-model="filters.event_status" aria-label="事件状态筛选">
              <option value="">全部</option>
              <option value="success">{{ toEventStatusLabel('success') }}</option>
              <option value="error">{{ toEventStatusLabel('error') }}</option>
            </select>
          </label>
        </div>
      </header>

      <section class="stats-grid">
        <ConsoleStatCard label="消费总量" :value="formatCompact(consumeSummary.total)" />
        <ConsoleStatCard label="消费成功" :value="formatCompact(consumeSummary.success_total)" tone="good" />
        <ConsoleStatCard label="消费失败" :value="formatCompact(consumeSummary.error_total)" tone="danger" />
        <ConsoleStatCard label="发布 P95" :value="formatMs(publishSummary.p95_duration_ms)" />
      </section>

      <section class="charts-grid">
        <LineChartCard
          title="发布耗时"
          subtitle="outbox_publish_duration_seconds"
          :labels="publishDurationLabels"
          :series="publishDurationSeries"
          :loading="loading && !dashboard"
          unit=" ms"
          :decimals="1"
        />
        <LineChartCard
          title="消费总量"
          subtitle="event_consume_total"
          :labels="consumeTotalLabels"
          :series="consumeTotalSeries"
          :loading="loading && !dashboard"
        />
        <LineChartCard
          title="消费耗时"
          subtitle="event_consume_duration_seconds"
          :labels="consumeDurationLabels"
          :series="consumeDurationSeries"
          :loading="loading && !dashboard"
          unit=" ms"
          :decimals="1"
        />
      </section>
    </section>

    <section class="panel-card">
      <header class="section-head">
        <div>
          <h3>Outbox 队列（离线消息）</h3>
          <p>实时快照与已发布/失败趋势。</p>
        </div>
      </header>

      <section class="stats-grid">
        <ConsoleStatCard label="待处理" :value="formatCompact(outboxSnapshotSummary.pending_total)" tone="warn" />
        <ConsoleStatCard label="已发布" :value="formatCompact(outboxSnapshotSummary.published_total)" tone="good" />
        <ConsoleStatCard label="失败" :value="formatCompact(outboxSnapshotSummary.failed_total)" tone="danger" />
        <ConsoleStatCard
          label="快照时间"
          :value="formatSnapshotTime(outboxSnapshotSummary.snapshot_at)"
          :hint="outboxSnapshotMode"
        />
      </section>

      <section class="charts-grid one-col">
        <LineChartCard
          title="Outbox 事件趋势"
          subtitle="已发布 / 失败"
          :labels="outboxTrendLabels"
          :series="outboxTrendSeries"
          :loading="loading && !dashboard"
        />
      </section>
    </section>

    <QueryInspector v-if="workbench.uiCapabilities.showQueryInspector" :items="inspectorItems" />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import LineChartCard from '../components/charts/LineChartCard.vue';
import ConsoleStatCard from '../components/console/ConsoleStatCard.vue';
import QueryInspector from '../components/console/QueryInspector.vue';
import { useWorkbenchState } from '../composables/useWorkbenchState';
import { zhCN } from '../locales/zh-CN';
import {
  RUNTIME_TIME_RANGE_OPTIONS,
  createDefaultRuntimeFilters,
  getRuntimeCatalog,
  loadRuntimeDashboard,
} from '../services/observabilityRuntime';
import type { RuntimePoint, RuntimeSummary } from '../types/runtime';
import type { RuntimeDashboardResult } from '../services/observabilityRuntime';
import type { RuntimeDashboardMetricKey } from '../types/runtime-page';
import { toDataSourceLabel, toEventStatusLabel, toTaskStatusLabel, toTopicDisplayLabel } from '../utils/displayLabel';

const pageKey = 'runtime';
const workbench = useWorkbenchState();
const t = zhCN;
const dataMode = workbench.dataMode;
const catalog = getRuntimeCatalog();
const filters = reactive(createDefaultRuntimeFilters());
const autoRefreshOptions = [0, 10, 30, 60];
const autoRefreshSeconds = ref(10);
const loading = ref(false);
const refreshing = ref(false);
const warningMessage = ref('');
const errorMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const dashboard = ref<RuntimeDashboardResult | null>(null);

let refreshTimer: number | null = null;

const sourceSummaryLabel = computed(() => {
  const metrics = dashboard.value?.metrics;
  if (!metrics) return toDataSourceLabel(dataMode.value);
  const sources = new Set(Object.values(metrics).map((item) => item.sourceUsed));
  if (sources.size === 1) {
    const first = sources.values().next().value;
    return toDataSourceLabel(first ?? dataMode.value);
  }
  return '混合数据';
});

function syncPageMeta(): void {
  workbench.setPageMeta(pageKey, {
    title: t.app.nav.runtime,
    description: t.runtime.title,
    updatedAt: lastUpdatedAt.value,
    loading: loading.value || refreshing.value,
    autoRefreshLabel: autoRefreshSeconds.value === 0 ? '手动刷新' : `${autoRefreshSeconds.value}s 自动刷新`,
    statusLabel: `当前${sourceSummaryLabel.value}`,
  });
}

async function loadRuntime(showLoading: boolean): Promise<void> {
  if (showLoading) {
    loading.value = true;
  } else {
    refreshing.value = true;
  }
  errorMessage.value = '';
  syncPageMeta();

  try {
    const result = await loadRuntimeDashboard({
      mode: dataMode.value,
      filters: { ...filters },
    });
    dashboard.value = result;
    warningMessage.value = result.warning ?? '';
    lastUpdatedAt.value = new Date();
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = `运行时指标加载失败，请稍后重试。原因：${message}`;
  } finally {
    loading.value = false;
    refreshing.value = false;
    syncPageMeta();
  }
}

function stopAutoRefresh(): void {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function resetAutoRefresh(): void {
  stopAutoRefresh();
  if (autoRefreshSeconds.value <= 0) return;
  refreshTimer = window.setInterval(() => {
    void loadRuntime(false);
  }, autoRefreshSeconds.value * 1000);
}

function manualRefresh(): void {
  void loadRuntime(true);
  resetAutoRefresh();
}

watch(
  () => [filters.range_id, filters.task_name, filters.task_status, filters.topic, filters.event_status, dataMode.value],
  () => {
    void loadRuntime(true);
    resetAutoRefresh();
  },
  { immediate: true },
);

watch(
  () => autoRefreshSeconds.value,
  () => {
    resetAutoRefresh();
    syncPageMeta();
  },
);

onUnmounted(() => {
  stopAutoRefresh();
});

const taskNameOptions = computed(() => catalog.taskNames);
const topicOptions = computed(() => catalog.topics);

function metricResult(key: RuntimeDashboardMetricKey) {
  return dashboard.value?.metrics[key];
}

function emptySummary(): RuntimeSummary {
  return {
    total: 0,
    success_total: 0,
    error_total: 0,
    skipped_total: 0,
    pending_total: 0,
    published_total: 0,
    failed_total: 0,
    p50_duration_ms: 0,
    p95_duration_ms: 0,
    p99_duration_ms: 0,
    max_duration_ms: 0,
  };
}

const taskSummary = computed(() => metricResult('taskExecution')?.response.summary ?? emptySummary());
const consumeSummary = computed(() => metricResult('consumeTotal')?.response.summary ?? emptySummary());
const publishSummary = computed(() => metricResult('publishDuration')?.response.summary ?? emptySummary());
const outboxSnapshotSummary = computed(() => metricResult('outboxSnapshot')?.response.summary ?? emptySummary());
const outboxSnapshotMode = computed(() => {
  const mode = metricResult('outboxSnapshot')?.response.mode ?? 'snapshot';
  return mode === 'snapshot' ? '快照模式' : '时序模式';
});

function seriesByStatus(rows: RuntimePoint[], expected: string[]): Array<{ name: string; color: string; values: number[] }> {
  const buckets = Array.from(new Set(rows.map((item) => item.bucket_start))).sort((a, b) => Date.parse(a) - Date.parse(b));
  const colors: Record<string, string> = {
    success: '#38bdf8',
    error: '#fb7185',
    skipped: '#f59e0b',
    published: '#22c55e',
    failed: '#fb7185',
  };
  const labels: Record<string, string> = {
    success: '成功',
    error: '失败',
    skipped: '跳过',
    published: '已发布',
    failed: '失败',
  };
  return expected.map((status) => ({
    name: labels[status] ?? status,
    color: colors[status] ?? '#94a3b8',
    values: buckets.map((bucket) =>
      rows
        .filter((item) => item.bucket_start === bucket && (item.status ?? '') === status)
        .reduce((acc, item) => acc + item.count, 0),
    ),
  }));
}

function labelsFromRows(rows: RuntimePoint[]): string[] {
  return Array.from(new Set(rows.map((item) => item.bucket_start)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .map((item) =>
      new Date(item).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
    );
}

function durationSeries(rows: RuntimePoint[]): Array<{ name: string; color: string; values: number[] }> {
  const buckets = Array.from(new Set(rows.map((item) => item.bucket_start))).sort((a, b) => Date.parse(a) - Date.parse(b));
  return [
    {
      name: '平均值',
      color: '#22c55e',
      values: buckets.map((bucket) => {
        const sample = rows.filter((item) => item.bucket_start === bucket);
        if (sample.length === 0) return 0;
        return sample.reduce((acc, item) => acc + item.avg_duration_ms, 0) / sample.length;
      }),
    },
    {
      name: '最大值',
      color: '#8b5cf6',
      values: buckets.map((bucket) =>
        rows
          .filter((item) => item.bucket_start === bucket)
          .reduce((acc, item) => Math.max(acc, item.max_duration_ms), 0),
      ),
    },
  ];
}

const taskExecutionRows = computed(() => metricResult('taskExecution')?.response.list ?? []);
const taskDurationRows = computed(() => metricResult('taskDuration')?.response.list ?? []);
const publishDurationRows = computed(() => metricResult('publishDuration')?.response.list ?? []);
const consumeTotalRows = computed(() => metricResult('consumeTotal')?.response.list ?? []);
const consumeDurationRows = computed(() => metricResult('consumeDuration')?.response.list ?? []);
const outboxPublishedRows = computed(() => metricResult('outboxPublished')?.response.list ?? []);
const outboxFailedRows = computed(() => metricResult('outboxFailed')?.response.list ?? []);

const taskExecutionLabels = computed(() => labelsFromRows(taskExecutionRows.value));
const taskExecutionSeries = computed(() => seriesByStatus(taskExecutionRows.value, ['success', 'error', 'skipped']));
const taskDurationLabels = computed(() => labelsFromRows(taskDurationRows.value));
const taskDurationSeries = computed(() => durationSeries(taskDurationRows.value));
const publishDurationLabels = computed(() => labelsFromRows(publishDurationRows.value));
const publishDurationSeries = computed(() => durationSeries(publishDurationRows.value));
const consumeTotalLabels = computed(() => labelsFromRows(consumeTotalRows.value));
const consumeTotalSeries = computed(() => seriesByStatus(consumeTotalRows.value, ['success', 'error']));
const consumeDurationLabels = computed(() => labelsFromRows(consumeDurationRows.value));
const consumeDurationSeries = computed(() => durationSeries(consumeDurationRows.value));

const outboxTrendLabels = computed(() => {
  const keys = Array.from(
    new Set(outboxPublishedRows.value.map((item) => item.bucket_start).concat(outboxFailedRows.value.map((item) => item.bucket_start))),
  ).sort((a, b) => Date.parse(a) - Date.parse(b));
  return keys.map((item) =>
    new Date(item).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }),
  );
});

const outboxTrendSeries = computed(() => {
  const keys = Array.from(
    new Set(outboxPublishedRows.value.map((item) => item.bucket_start).concat(outboxFailedRows.value.map((item) => item.bucket_start))),
  ).sort((a, b) => Date.parse(a) - Date.parse(b));
  return [
    {
      name: '已发布',
      color: '#22c55e',
      values: keys.map((bucket) =>
        outboxPublishedRows.value
          .filter((item) => item.bucket_start === bucket)
          .reduce((acc, item) => acc + item.count, 0),
      ),
    },
    {
      name: '失败',
      color: '#fb7185',
      values: keys.map((bucket) =>
        outboxFailedRows.value
          .filter((item) => item.bucket_start === bucket)
          .reduce((acc, item) => acc + item.count, 0),
      ),
    },
  ];
});

const inspectorItems = computed(() =>
  dashboard.value?.requests.map((item) => ({
    label: `POST /system/observability/runtime/query (${item.key})`,
    payload: item.request,
    sourceUsed: metricResult(item.key)?.sourceUsed,
  })) ?? [],
);

function formatCompact(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatSnapshotTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
</script>

<style scoped>
.page-shell {
  display: grid;
  gap: 18px;
}

.page-header,
.section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--ink-soft);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.page-header h2,
.section-head h3 {
  margin: 0;
  color: var(--ink-strong);
}

.desc,
.section-head p {
  margin: 6px 0 0;
  color: var(--ink-soft);
}

.header-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(17, 24, 39, 0.08);
  color: var(--ink-strong);
  font-size: 0.78rem;
  font-weight: 700;
}

.toolbar-card,
.panel-card {
  border-radius: 22px;
  border: 1px solid var(--panel-line);
  background: var(--panel-bg);
  padding: 18px;
  box-shadow: var(--panel-shadow);
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.toolbar-card:hover,
.panel-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 34px rgba(15, 23, 42, 0.11);
}

.toolbar-row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 6px;
  grid-column: span 2;
}

.field.compact {
  min-width: 180px;
}

.field span {
  font-size: 0.74rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.field select {
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  background: #ffffff;
  padding: 10px 12px;
  color: var(--ink-strong);
}

.field select:focus-visible {
  border-color: #0ea5e9;
}

.toolbar-actions {
  grid-column: span 2;
  display: flex;
  align-items: end;
}

.section-filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.primary-btn {
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  padding: 10px 16px;
  background: linear-gradient(135deg, #0f172a, #22324a);
  color: #f8fafc;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--motion-fast) ease;
}

.primary-btn:hover {
  transform: translateY(-1px);
}

.stats-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 16px;
}

.charts-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}

.charts-grid.one-col {
  grid-template-columns: 1fr;
}

.notice {
  margin: 0;
  border-radius: 14px;
  padding: 12px 14px;
}

.warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.22);
  color: #9a6700;
}

.error {
  background: rgba(244, 63, 94, 0.1);
  border: 1px solid rgba(244, 63, 94, 0.2);
  color: #991b1b;
}

@media (max-width: 1200px) {
  .stats-grid,
  .charts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .page-header,
  .section-head {
    flex-direction: column;
  }

  .toolbar-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field,
  .toolbar-actions {
    grid-column: span 2;
  }

  .stats-grid,
  .charts-grid {
    grid-template-columns: 1fr;
  }

  .section-filters {
    width: 100%;
  }
}

@media (max-width: 390px) {
  .toolbar-card,
  .panel-card {
    padding: 14px;
  }
}
</style>
