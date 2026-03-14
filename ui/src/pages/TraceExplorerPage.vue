<template>
  <section class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ t.app.nav.traceExplorer }}</p>
        <h2>{{ t.traceExplorer.title }}</h2>
        <p class="desc">{{ t.traceExplorer.desc }}</p>
      </div>
      <div class="header-meta">
        <span class="meta-pill">数据来源：{{ toDataSourceLabel(latestSource) }}</span>
        <span class="meta-pill">当前行数：{{ filteredItems.length }}</span>
        <span class="meta-pill">后端总量：{{ serverTotal }}</span>
      </div>
    </header>

    <TraceFilterBar
      :filters="filters"
      :loading="loading"
      :time-range-options="TRACE_TIME_RANGE_OPTIONS"
      :service-options="serviceOptions"
      :page-size-options="TRACE_PAGE_SIZE_OPTIONS"
      @update:filters="onFiltersUpdated"
      @search="search"
      @reset="resetAll"
    />

    <p v-if="warningMessage" class="notice warning">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="notice error">{{ errorMessage }}</p>

    <section class="list-card">
      <header class="section-head">
        <div>
          <h3>链路根摘要</h3>
          <p>点击任意行进入统一详情页，详情由 `idType` 控制 trace/request 查询来源。</p>
        </div>
      </header>

      <div v-if="loading && filteredItems.length === 0" class="state-block skeleton-block">加载中...</div>
      <div v-else-if="pagedItems.length === 0" class="state-block">暂无匹配链路</div>
      <div v-else class="rows">
        <article v-for="item in pagedItems" :key="item.trace_id" class="trace-row" @click="openTraceDetail(item.trace_id)">
          <div class="row-main">
            <div class="title-line">
              <span class="status" :class="item.status">{{ toTraceStatusLabel(item.status) }}</span>
              <span class="service">{{ toServiceDisplayLabel(item.service) }}</span>
              <span class="stage">{{ formatStageLabel(item.stage) }}</span>
              <span v-if="item.method" class="method-pill">{{ item.method }}</span>
              <h4 :title="item.name">{{ item.name }}</h4>
            </div>
            <div class="meta-line">
              <span>Trace ID：<code>{{ item.trace_id }}</code></span>
              <span>Request ID：<code>{{ item.request_id || '-' }}</code></span>
              <span v-if="item.route_template">路由：<code>{{ item.route_template }}</code></span>
            </div>
          </div>

          <div class="row-side">
            <div class="duration">{{ item.duration_ms }}ms</div>
            <div class="sub-metrics">
              <span>类型：{{ item.kind }}</span>
              <span>Span 数：{{ item.span_total }}</span>
              <span class="error-count">错误 Span：{{ item.error_span_total }}</span>
            </div>
          </div>
        </article>
      </div>

      <footer v-if="filteredItems.length > 0" class="pager">
        <button :disabled="currentPage <= 1" @click="prevPage">上一页</button>
        <span>第 {{ currentPage }} 页 / 共 {{ totalPages }} 页</span>
        <button :disabled="currentPage >= totalPages" @click="nextPage">下一页</button>
      </footer>
    </section>

    <QueryInspector v-if="workbench.uiCapabilities.showQueryInspector" :items="inspectorItems" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QueryInspector from '../components/console/QueryInspector.vue';
import TraceFilterBar from '../components/tracing/TraceFilterBar.vue';
import { useWorkbenchState } from '../composables/useWorkbenchState';
import { zhCN } from '../locales/zh-CN';
import {
  TRACE_PAGE_SIZE_OPTIONS,
  TRACE_TIME_RANGE_OPTIONS,
  applyTraceLocalHints,
  buildTraceSummaryReq,
  createDefaultTraceFilters,
  getTraceFilterCatalog,
  queryTraceList,
  resolveSearchMode,
  toTraceDetailRoute,
} from '../services/observabilityTracing';
import type { TraceExplorerFilters, TraceSummaryResp } from '../types/tracing';
import { toDataSourceLabel, toServiceDisplayLabel, toTraceStatusLabel } from '../utils/displayLabel';

const pageKey = 'trace-explorer';
const router = useRouter();
const route = useRoute();
const workbench = useWorkbenchState();
const t = zhCN;
const dataMode = workbench.dataMode;
const catalog = getTraceFilterCatalog();

const filters = ref<TraceExplorerFilters>(createDefaultTraceFilters());
const loading = ref(false);
const warningMessage = ref('');
const errorMessage = ref('');
const currentPage = ref(1);
const latestRequest = ref(buildTraceSummaryReq({
  rangeId: filters.value.range_id,
  service: filters.value.service,
  status: filters.value.status,
  rootStage: filters.value.root_stage,
  limit: 200,
}));
const latestSource = ref<'mock' | 'api'>(dataMode.value);
const serverTotal = ref(0);
const items = ref<TraceSummaryResp[]>([]);
const lastUpdatedAt = ref<Date | null>(null);

function hydrateFromRoute(): void {
  const next = createDefaultTraceFilters();
  next.service = typeof route.query.service === 'string' ? route.query.service : '';
  const rootStageQuery = typeof route.query.rootStage === 'string' ? route.query.rootStage : '';
  next.root_stage = rootStageQuery === 'task' || rootStageQuery === 'all' ? rootStageQuery : 'http.request';
  next.route_hint = typeof route.query.routeHint === 'string' ? route.query.routeHint : '';
  next.method_hint = typeof route.query.methodHint === 'string' ? route.query.methodHint : '';
  const rangeIdQuery = typeof route.query.rangeId === 'string' ? route.query.rangeId : '';
  next.range_id =
    rangeIdQuery === '15m' ||
    rangeIdQuery === '1h' ||
    rangeIdQuery === '6h' ||
    rangeIdQuery === '24h' ||
    rangeIdQuery === '7d'
      ? rangeIdQuery
      : '1h';
  filters.value = next;
}

hydrateFromRoute();

function syncPageMeta(): void {
  workbench.setPageMeta(pageKey, {
    title: t.app.nav.traceExplorer,
    description: t.traceExplorer.title,
    updatedAt: lastUpdatedAt.value,
    loading: loading.value,
    autoRefreshLabel: '手动刷新',
    statusLabel: `当前${toDataSourceLabel(latestSource.value)}`,
  });
}

const serviceOptions = computed(() => Array.from(new Set([...catalog.services, ...items.value.map((item) => item.service)])).sort());

const filteredItems = computed(() =>
  applyTraceLocalHints(items.value, {
    methodHint: filters.value.method_hint,
    routeHint: filters.value.route_hint,
  }),
);

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / Math.max(1, filters.value.page_size))));
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * filters.value.page_size;
  return filteredItems.value.slice(start, start + filters.value.page_size);
});

const inspectorItems = computed(() => [
  {
    label: 'POST /system/observability/traces/query',
    payload: latestRequest.value,
    sourceUsed: latestSource.value,
  },
]);

function onFiltersUpdated(next: TraceExplorerFilters): void {
  const changedPageSize = next.page_size !== filters.value.page_size;
  filters.value = { ...next };
  if (changedPageSize) currentPage.value = 1;
}

async function search(): Promise<void> {
  loading.value = true;
  warningMessage.value = '';
  errorMessage.value = '';
  syncPageMeta();

  try {
    const searchId = filters.value.search_id.trim();
    const resolvedMode = resolveSearchMode(searchId, filters.value.search_mode);
    if (searchId && resolvedMode) {
      await router.push(toTraceDetailRoute(searchId, resolvedMode));
      return;
    }

    const req = buildTraceSummaryReq({
      rangeId: filters.value.range_id,
      service: filters.value.service,
      status: filters.value.status,
      rootStage: filters.value.root_stage,
      limit: 200,
      offset: 0,
    });
    latestRequest.value = req;

    const result = await queryTraceList({ mode: dataMode.value, req });
    items.value = result.data.list;
    serverTotal.value = result.data.total;
    latestSource.value = result.sourceUsed;
    currentPage.value = 1;
    lastUpdatedAt.value = new Date();

    const warnings: string[] = [];
    if (result.warning) warnings.push(result.warning);
    if (filters.value.route_hint || filters.value.method_hint) {
      warnings.push('method/route 仅做本地二级过滤，当前不会下推到后端。');
    }
    if (result.data.total > result.data.list.length) {
      warnings.push(`后端总量 ${result.data.total}，当前仅缓存前 ${result.data.list.length} 条用于本地分页。`);
    }
    warningMessage.value = Array.from(new Set(warnings)).join(' ');
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = `链路查询失败，请稍后重试。原因：${message}`;
    items.value = [];
    serverTotal.value = 0;
  } finally {
    loading.value = false;
    syncPageMeta();
  }
}

function resetAll(): void {
  hydrateFromRoute();
  currentPage.value = 1;
  void search();
}

function openTraceDetail(traceId: string): void {
  void router.push(toTraceDetailRoute(traceId, 'trace'));
}

function prevPage(): void {
  currentPage.value = Math.max(1, currentPage.value - 1);
}

function nextPage(): void {
  currentPage.value = Math.min(totalPages.value, currentPage.value + 1);
}

function formatStageLabel(stage: string): string {
  if (stage === 'http.request') return 'HTTP 请求';
  if (stage === 'task') return '定时任务';
  return stage || '-';
}

watch(
  () => route.fullPath,
  () => {
    hydrateFromRoute();
    void search();
  },
);

watch(
  () => dataMode.value,
  () => {
    void search();
  },
);

void search();
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

.list-card {
  border-radius: 22px;
  border: 1px solid var(--panel-line);
  background: var(--panel-bg);
  padding: 18px;
  box-shadow: var(--panel-shadow);
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.list-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 34px rgba(15, 23, 42, 0.11);
}

.section-head {
  margin-bottom: 14px;
}

.rows {
  display: grid;
  gap: 12px;
}

.trace-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.92));
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color var(--motion-fast) ease, box-shadow var(--motion-fast) ease, transform var(--motion-fast) ease;
}

tbody tr:hover,
.trace-row:hover {
  transform: translateY(-1px);
  border-color: rgba(59, 130, 246, 0.24);
  box-shadow: 0 14px 26px rgba(15, 23, 42, 0.08);
}

.title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title-line h4 {
  margin: 0;
  color: var(--ink-strong);
}

.status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
}

.status.ok {
  background: rgba(34, 197, 94, 0.14);
  color: #166534;
}

.status.error {
  background: rgba(244, 63, 94, 0.12);
  color: #9f1239;
}

.service,
.stage {
  color: var(--ink-soft);
  font-size: 0.83rem;
  font-weight: 700;
}

.meta-line,
.sub-metrics {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
  color: var(--ink-soft);
  font-size: 0.84rem;
}

.meta-line code {
  font-family: 'IBM Plex Mono', monospace;
}

.row-side {
  display: grid;
  gap: 10px;
  align-content: start;
  justify-items: end;
}

.duration {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--ink-strong);
}

.error-count {
  color: #9f1239;
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.pager button {
  border-radius: 10px;
  border: 1px solid var(--panel-line);
  background: #f8fafc;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--motion-fast) ease;
}

.pager button:hover {
  transform: translateY(-1px);
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

@media (max-width: 920px) {
  .page-header {
    flex-direction: column;
  }

  .trace-row {
    grid-template-columns: 1fr;
  }

  .row-side {
    justify-items: start;
  }
}

@media (max-width: 390px) {
  .list-card {
    padding: 14px;
  }

  .meta-line,
  .sub-metrics {
    gap: 8px;
  }
}
</style>
