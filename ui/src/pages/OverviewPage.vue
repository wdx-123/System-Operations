<template>
  <section class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t.app.nav.overview }}</p>
        <h2>{{ t.overview.title }}</h2>
        <p class="desc">{{ t.overview.desc }}</p>
      </div>
      <div class="header-meta">
        <span class="meta-pill">数据来源：{{ toDataSourceLabel(latestSource) }}</span>
        <span class="meta-pill">{{ autoRefreshSeconds === 0 ? '手动刷新' : `${autoRefreshSeconds}s 自动刷新` }}</span>
      </div>
    </header>

    <section class="toolbar-card">
      <div class="toolbar-row">
        <label class="field">
          <span>时间范围</span>
          <select v-model="selectedRange">
            <option v-for="item in METRICS_TIME_RANGE_OPTIONS" :key="item.id" :value="item.id">{{ item.label }}</option>
          </select>
        </label>

        <label class="field">
          <span>自动刷新</span>
          <select v-model.number="autoRefreshSeconds">
            <option v-for="option in autoRefreshOptions" :key="option" :value="option">
              {{ option === 0 ? '关闭' : `${option} 秒` }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>服务</span>
          <select v-model="filters.service" aria-label="服务筛选">
            <option value="">全部</option>
            <option v-for="service in serviceOptions" :key="service" :value="service">{{ toServiceDisplayLabel(service) }}</option>
          </select>
        </label>

        <label class="field">
          <span>方法</span>
          <select v-model="filters.method" aria-label="方法筛选">
            <option value="">全部</option>
            <option v-for="method in methodOptions" :key="method || 'all'" :value="method">
              {{ method || '全部' }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>状态分类</span>
          <select v-model="statusClassModel" aria-label="状态分类筛选">
            <option value="">全部</option>
            <option value="2">2xx</option>
            <option value="4">4xx</option>
            <option value="5">5xx</option>
          </select>
        </label>

        <button class="primary-btn" :disabled="loading" aria-label="立即刷新总览数据" @click="manualRefresh">
          {{ loading ? '加载中...' : '立即刷新' }}
        </button>
      </div>

      <div class="toolbar-row">
        <label class="field grow">
          <span>路由模板</span>
          <input v-model="filters.route_template" type="text" aria-label="路由模板筛选" list="route-options" placeholder="/api/v1/users/:id" />
          <datalist id="route-options">
            <option v-for="route in routeOptions" :key="route" :value="route"></option>
          </datalist>
        </label>

        <label class="field">
          <span>错误码</span>
          <input v-model="filters.error_code" type="text" aria-label="错误码筛选" list="error-options" placeholder="PAY-50002" />
          <datalist id="error-options">
            <option v-for="code in errorCodeOptions" :key="code" :value="code"></option>
          </datalist>
        </label>

        <button class="ghost-btn" aria-label="清空所有筛选条件" @click="clearFilters">清空筛选</button>
      </div>
    </section>

    <p v-if="warningMessage" class="notice warning">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="notice error">{{ errorMessage }}</p>

    <section class="stats-grid">
      <ConsoleStatCard label="RPS" :value="formatDecimal(summary.rps, 2)" :hint="`总请求 ${formatCompact(summary.totalRequests)}`" />
      <ConsoleStatCard
        label="错误率"
        :value="formatPercent(summary.errorRate)"
        :hint="`错误 ${formatCompact(summary.totalErrors)}`"
        :tone="summary.errorRate > 0.05 ? 'danger' : summary.errorRate > 0.02 ? 'warn' : 'good'"
      />
      <ConsoleStatCard label="平均时延" :value="formatMs(summary.avgLatency)" hint="按请求量加权平均" />
      <ConsoleStatCard label="峰值时延" :value="formatMs(summary.p100)" :hint="`粒度 ${granularity}`" />
    </section>

    <section class="charts-grid">
      <LineChartCard
        title="每秒请求数"
        subtitle="按 metrics/query 真实契约聚合"
        :labels="chartLabels"
        :series="requestSeries"
        :loading="loading && points.length === 0"
        unit=" rps"
        :decimals="2"
      />
      <BarChartCard
        title="错误率趋势"
        subtitle="每个时间桶的错误率"
        :labels="chartLabels"
        :values="errorRateValues"
        :loading="loading && points.length === 0"
        color="#f59e0b"
        unit="%"
        :decimals="2"
      />
      <LineChartCard
        title="时延趋势"
        subtitle="平均耗时和峰值时延"
        :labels="chartLabels"
        :series="latencySeries"
        :loading="loading && points.length === 0"
        unit=" ms"
        :decimals="1"
      />
    </section>

    <section class="table-card">
      <header class="section-head">
        <div>
          <h3>慢请求路由 Top10</h3>
          <p>点击跳转链路查询页，并附带服务过滤和本地路由/方法提示（route/method）。</p>
        </div>
      </header>

      <div v-if="loading && points.length === 0" class="state-block skeleton-block">加载中...</div>
      <div v-else-if="topSlowRoutes.length === 0" class="state-block">当前筛选范围内暂无指标数据。</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>路由</th>
              <th>方法</th>
              <th>服务</th>
              <th>请求数</th>
              <th>错误率</th>
              <th>平均时延</th>
              <th>最大时延</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in topSlowRoutes" :key="row.key" @click="jumpToTraceExplorer(row)">
              <td class="route">{{ row.route_template }}</td>
              <td><span class="method-pill">{{ row.method }}</span></td>
              <td>{{ toServiceDisplayLabel(row.service) }}</td>
              <td>{{ formatCompact(row.request_count) }}</td>
              <td>{{ formatPercent(row.error_rate) }}</td>
              <td>{{ formatMs(row.avg_latency) }}</td>
              <td>{{ formatMs(row.max_latency) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <QueryInspector v-if="workbench.uiCapabilities.showQueryInspector" :items="inspectorItems" />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BarChartCard from '../components/charts/BarChartCard.vue';
import LineChartCard from '../components/charts/LineChartCard.vue';
import ConsoleStatCard from '../components/console/ConsoleStatCard.vue';
import QueryInspector from '../components/console/QueryInspector.vue';
import { useWorkbenchState } from '../composables/useWorkbenchState';
import { zhCN } from '../locales/zh-CN';
import {
  METRICS_TIME_RANGE_OPTIONS,
  buildMetricsQueryReq,
  createEmptyMetricsFilters,
  getMetricsBucketSeconds,
  getMetricsFilterCatalog,
  queryMetricsData,
} from '../services/observabilityMetrics';
import type { MetricsFilters, MetricsGranularity, MetricsPoint } from '../types/metrics';
import { toDataSourceLabel, toServiceDisplayLabel } from '../utils/displayLabel';

interface BucketAggregate {
  bucket_start: string;
  request_2xx: number;
  request_4xx: number;
  request_5xx: number;
  request_total: number;
  error_total: number;
  total_latency_ms: number;
  max_latency_ms: number;
}

interface SlowRouteRow {
  key: string;
  route_template: string;
  method: string;
  service: string;
  request_count: number;
  error_rate: number;
  avg_latency: number;
  max_latency: number;
}

const pageKey = 'overview';
const router = useRouter();
const workbench = useWorkbenchState();
const t = zhCN;
const dataMode = workbench.dataMode;
const catalog = getMetricsFilterCatalog();
const methodOptions = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const autoRefreshOptions = [0, 5, 10, 30, 60];

const selectedRange = ref<'15m' | '1h' | '6h' | '24h' | '7d' | '30d'>('1h');
const autoRefreshSeconds = ref(10);
const filters = reactive<MetricsFilters>(createEmptyMetricsFilters());
const points = ref<MetricsPoint[]>([]);
const granularity = ref<MetricsGranularity>('1m');
const loading = ref(false);
const refreshing = ref(false);
const warningMessage = ref('');
const errorMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const latestRequest = ref(buildMetricsQueryReq({ rangeId: '1h', filters: createEmptyMetricsFilters() }));
const latestSource = ref<'mock' | 'api'>(dataMode.value);

let refreshTimer: number | null = null;

const statusClassModel = computed<string>({
  get() {
    return filters.status_class === '' ? '' : String(filters.status_class);
  },
  set(value: string) {
    filters.status_class = value === '2' || value === '4' || value === '5' ? (Number(value) as 2 | 4 | 5) : '';
  },
});

function snapshotFilters(): MetricsFilters {
  return {
    service: filters.service,
    route_template: filters.route_template,
    method: filters.method,
    status_class: filters.status_class,
    error_code: filters.error_code,
  };
}

function syncPageMeta(): void {
  workbench.setPageMeta(pageKey, {
    title: t.app.nav.overview,
    description: t.overview.title,
    updatedAt: lastUpdatedAt.value,
    loading: loading.value || refreshing.value,
    autoRefreshLabel: autoRefreshSeconds.value === 0 ? '手动刷新' : `${autoRefreshSeconds.value}s 自动刷新`,
    statusLabel: `当前${toDataSourceLabel(latestSource.value)}`,
  });
}

async function loadDashboard(showLoading: boolean): Promise<void> {
  if (showLoading) {
    loading.value = true;
  } else {
    refreshing.value = true;
  }
  errorMessage.value = '';
  syncPageMeta();

  try {
    const result = await queryMetricsData({
      mode: dataMode.value,
      input: {
        rangeId: selectedRange.value,
        filters: snapshotFilters(),
      },
    });
    latestRequest.value = buildMetricsQueryReq({
      rangeId: selectedRange.value,
      filters: snapshotFilters(),
    });
    points.value = result.data.list;
    granularity.value = result.data.granularity;
    warningMessage.value = result.warning ?? '';
    latestSource.value = result.sourceUsed;
    lastUpdatedAt.value = new Date();
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = `指标加载失败，请稍后重试。原因：${message}`;
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
    void loadDashboard(false);
  }, autoRefreshSeconds.value * 1000);
}

function manualRefresh(): void {
  void loadDashboard(true);
  resetAutoRefresh();
}

function clearFilters(): void {
  Object.assign(filters, createEmptyMetricsFilters());
}

watch(
  () => [
    selectedRange.value,
    dataMode.value,
    filters.service,
    filters.route_template,
    filters.method,
    filters.status_class,
    filters.error_code,
  ],
  () => {
    void loadDashboard(true);
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

const serviceOptions = computed(() => Array.from(new Set([...catalog.services, ...points.value.map((item) => item.service)])).sort());
const routeOptions = computed(() => Array.from(new Set([...catalog.routes, ...points.value.map((item) => item.route_template)])).sort());
const errorCodeOptions = computed(() =>
  Array.from(new Set(points.value.map((item) => item.error_code).filter((item) => item))).sort(),
);

const inspectorItems = computed(() => [
  {
    label: 'POST /system/observability/metrics/query',
    payload: latestRequest.value,
    sourceUsed: latestSource.value,
  },
]);

function formatBucketLabel(isoString: string, mode: MetricsGranularity): string {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return '--';
  if (mode === '1m' || mode === '5m') {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (mode === '1d') {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

const buckets = computed<BucketAggregate[]>(() => {
  const map = new Map<string, BucketAggregate>();

  points.value.forEach((item) => {
    if (!map.has(item.bucket_start)) {
      map.set(item.bucket_start, {
        bucket_start: item.bucket_start,
        request_2xx: 0,
        request_4xx: 0,
        request_5xx: 0,
        request_total: 0,
        error_total: 0,
        total_latency_ms: 0,
        max_latency_ms: 0,
      });
    }

    const bucket = map.get(item.bucket_start);
    if (!bucket) return;
    bucket.request_total += item.request_count;
    bucket.error_total += item.error_count;
    bucket.total_latency_ms += item.total_latency_ms;
    bucket.max_latency_ms = Math.max(bucket.max_latency_ms, item.max_latency_ms);

    if (item.status_class === 2) bucket.request_2xx += item.request_count;
    if (item.status_class === 4) bucket.request_4xx += item.request_count;
    if (item.status_class === 5) bucket.request_5xx += item.request_count;
  });

  return Array.from(map.values()).sort((a, b) => Date.parse(a.bucket_start) - Date.parse(b.bucket_start));
});

const chartLabels = computed(() => buckets.value.map((item) => formatBucketLabel(item.bucket_start, granularity.value)));

const requestSeries = computed(() => {
  const bucketSeconds = getMetricsBucketSeconds(granularity.value);
  return [
    {
      name: '2xx',
      color: '#38bdf8',
      values: buckets.value.map((item) => item.request_2xx / bucketSeconds),
    },
    {
      name: '4xx',
      color: '#f59e0b',
      values: buckets.value.map((item) => item.request_4xx / bucketSeconds),
    },
    {
      name: '5xx',
      color: '#fb7185',
      values: buckets.value.map((item) => item.request_5xx / bucketSeconds),
    },
  ];
});

const errorRateValues = computed(() =>
  buckets.value.map((item) => (item.request_total > 0 ? (item.error_total / item.request_total) * 100 : 0)),
);

const latencySeries = computed(() => [
  {
    name: '平均值',
    color: '#22c55e',
    values: buckets.value.map((item) => (item.request_total > 0 ? item.total_latency_ms / item.request_total : 0)),
  },
  {
    name: '峰值',
    color: '#8b5cf6',
    values: buckets.value.map((item) => item.max_latency_ms),
  },
]);

const summary = computed(() => {
  const totalRequests = points.value.reduce((acc, item) => acc + item.request_count, 0);
  const totalErrors = points.value.reduce((acc, item) => acc + item.error_count, 0);
  const totalLatency = points.value.reduce((acc, item) => acc + item.total_latency_ms, 0);
  const maxLatency = points.value.reduce((acc, item) => Math.max(acc, item.max_latency_ms), 0);
  const rangeStart = latestRequest.value?.start_at ? Date.parse(latestRequest.value.start_at) : Number.NaN;
  const rangeEnd = latestRequest.value?.end_at ? Date.parse(latestRequest.value.end_at) : Number.NaN;
  const rangeSeconds = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) ? Math.max(1, (rangeEnd - rangeStart) / 1000) : 1;

  return {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    avgLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
    p100: maxLatency,
    rps: totalRequests / rangeSeconds,
  };
});

const topSlowRoutes = computed<SlowRouteRow[]>(() => {
  const map = new Map<string, SlowRouteRow>();
  points.value.forEach((item) => {
    const key = `${item.service}|${item.route_template}|${item.method}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        route_template: item.route_template,
        method: item.method,
        service: item.service,
        request_count: 0,
        error_rate: 0,
        avg_latency: 0,
        max_latency: 0,
      });
    }

    const row = map.get(key);
    if (!row) return;
    row.request_count += item.request_count;
    row.avg_latency += item.total_latency_ms;
    row.error_rate += item.error_count;
    row.max_latency = Math.max(row.max_latency, item.max_latency_ms);
  });

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avg_latency: row.request_count > 0 ? row.avg_latency / row.request_count : 0,
      error_rate: row.request_count > 0 ? row.error_rate / row.request_count : 0,
    }))
    .sort((a, b) => b.avg_latency - a.avg_latency)
    .slice(0, 10);
});

function jumpToTraceExplorer(row: SlowRouteRow): void {
  void router.push({
    path: '/trace/explorer',
    query: {
      service: row.service,
      rootStage: 'http.request',
      routeHint: row.route_template,
      methodHint: row.method,
      rangeId: selectedRange.value === '30d' ? '7d' : selectedRange.value,
    },
  });
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatDecimal(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}
</script>

<style scoped>
.page-shell {
  display: grid;
  gap: 18px;
}

.page-header {
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

.meta-pill,
.method-pill {
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
.table-card {
  border-radius: 22px;
  border: 1px solid var(--panel-line);
  background: var(--panel-bg);
  padding: 18px;
  box-shadow: var(--panel-shadow);
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.toolbar-card:hover,
.table-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 34px rgba(15, 23, 42, 0.11);
}

.toolbar-row {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 12px;
}

.toolbar-row + .toolbar-row {
  margin-top: 12px;
}

.field {
  grid-column: span 2;
  display: grid;
  gap: 6px;
}

.field.grow {
  grid-column: span 4;
}

.field span {
  font-size: 0.74rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.field select,
.field input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  background: #ffffff;
  padding: 10px 12px;
  color: var(--ink-strong);
}

.field select:focus-visible,
.field input:focus-visible {
  border-color: #0ea5e9;
}

.primary-btn,
.ghost-btn {
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  padding: 0 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.primary-btn {
  background: linear-gradient(135deg, #0f172a, #22324a);
  color: #f8fafc;
}

.ghost-btn {
  background: #f8fafc;
  color: var(--ink-strong);
}

.primary-btn:hover,
.ghost-btn:hover {
  transform: translateY(-1px);
}

.stats-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.charts-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 14px;
}

.table-wrap {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  text-align: left;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: rgba(148, 163, 184, 0.08);
}

.route {
  font-family: 'IBM Plex Mono', monospace;
}

.state-block {
  min-height: 220px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px dashed var(--panel-line);
  background: var(--panel-muted);
  color: var(--ink-soft);
}

@media (max-width: 1280px) {
  .toolbar-row {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .field,
  .field.grow {
    grid-column: span 2;
  }

  .stats-grid,
  .charts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .page-header {
    flex-direction: column;
  }

  .toolbar-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field,
  .field.grow {
    grid-column: span 2;
  }

  .stats-grid,
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 390px) {
  .toolbar-card,
  .table-card {
    padding: 14px;
  }

  th,
  td {
    white-space: nowrap;
  }
}
</style>
