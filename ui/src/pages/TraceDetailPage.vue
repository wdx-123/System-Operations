<template>
  <section class="page-shell">
    <header class="page-header">
      <div class="header-main">
        <button class="back-btn" aria-label="返回链路列表" @click="goExplorer">{{ t.traceDetail.back }}</button>
        <div>
          <p class="eyebrow">{{ t.traceDetail.title }}</p>
          <h2>{{ targetId }}</h2>
          <p class="desc">统一走 `traces/detail/:id?id_type=...`，当前按 {{ idTypeLabel }} 查询。</p>
        </div>
      </div>
      <div class="header-meta">
        <span class="meta-pill">数据来源：{{ toDataSourceLabel(latestSource) }}</span>
        <span class="meta-pill">Span 数：{{ spans.length }}</span>
        <span class="meta-pill">服务数：{{ serviceCount }}</span>
        <span class="meta-pill">错误数：{{ errorCount }}</span>
      </div>
    </header>

    <section class="stats-grid">
      <ConsoleStatCard label="总耗时" :value="formatMs(totalDurationMs)" />
      <ConsoleStatCard label="Span 数量" :value="String(spans.length)" />
      <ConsoleStatCard label="服务数量" :value="String(serviceCount)" />
      <ConsoleStatCard label="错误数量" :value="String(errorCount)" :tone="errorCount > 0 ? 'danger' : 'good'" />
    </section>

    <p v-if="warningMessage" class="notice warning">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="notice error">{{ errorMessage }}</p>

    <section class="content-grid">
      <TraceWaterfall
        :spans="spans"
        :loading="loading"
        :selected-span-id="selectedSpan?.span_id ?? null"
        @select="onSpanSelected"
      />
      <TraceSpanDrawer :span="selectedSpan" @close="selectedSpan = null" />
    </section>

    <QueryInspector v-if="workbench.uiCapabilities.showQueryInspector" :items="inspectorItems" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ConsoleStatCard from '../components/console/ConsoleStatCard.vue';
import QueryInspector from '../components/console/QueryInspector.vue';
import TraceSpanDrawer from '../components/tracing/TraceSpanDrawer.vue';
import TraceWaterfall from '../components/tracing/TraceWaterfall.vue';
import { useWorkbenchState } from '../composables/useWorkbenchState';
import { zhCN } from '../locales/zh-CN';
import { buildTraceDetailReq, queryTraceDetail } from '../services/observabilityTracing';
import type { TraceDetailSource, TraceSpanResp } from '../types/tracing';
import { toDataSourceLabel, toTraceIdTypeLabel } from '../utils/displayLabel';

const pageKey = 'trace-detail';
const props = defineProps<{
  source: TraceDetailSource;
  id: string;
}>();

const router = useRouter();
const workbench = useWorkbenchState();
const t = zhCN;
const dataMode = workbench.dataMode;
const spans = ref<TraceSpanResp[]>([]);
const selectedSpan = ref<TraceSpanResp | null>(null);
const loading = ref(false);
const warningMessage = ref('');
const errorMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const latestSource = ref<'mock' | 'api'>(dataMode.value);

const detailReq = buildTraceDetailReq({
  include_payload: true,
  include_error_detail: true,
  limit: 1000,
  offset: 0,
});

const targetId = computed(() => props.id);
const idTypeLabel = computed(() => toTraceIdTypeLabel(props.source));
const serviceCount = computed(() => new Set(spans.value.map((item) => item.service)).size);
const errorCount = computed(() => spans.value.filter((item) => item.status === 'error').length);
const totalDurationMs = computed(() => {
  if (spans.value.length === 0) return 0;
  const start = Math.min(...spans.value.map((item) => Date.parse(item.start_at)));
  const end = Math.max(...spans.value.map((item) => Date.parse(item.end_at)));
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
});

const inspectorItems = computed(() => [
  {
    label: `GET /system/observability/traces/detail/${props.id}`,
    payload: {
      id_type: props.source,
      ...detailReq,
    },
    sourceUsed: latestSource.value,
  },
]);

function syncPageMeta(): void {
  workbench.setPageMeta(pageKey, {
    title: t.traceDetail.title,
    description: `${idTypeLabel.value} 查询`,
    updatedAt: lastUpdatedAt.value,
    loading: loading.value,
    autoRefreshLabel: '手动刷新',
    statusLabel: `当前${toDataSourceLabel(latestSource.value)}`,
  });
}

function chooseDefaultSpan(list: TraceSpanResp[]): TraceSpanResp | null {
  if (list.length === 0) return null;
  return list.find((item) => item.status === 'error') ?? list.find((item) => !item.parent_span_id) ?? list[0] ?? null;
}

function onSpanSelected(span: TraceSpanResp): void {
  selectedSpan.value = span;
}

function goExplorer(): void {
  void router.push('/trace/explorer');
}

async function loadDetail(): Promise<void> {
  loading.value = true;
  warningMessage.value = '';
  errorMessage.value = '';
  syncPageMeta();

  try {
    const result = await queryTraceDetail({
      mode: dataMode.value,
      source: props.source,
      id: props.id,
      req: detailReq,
    });
    spans.value = result.data.list;
    selectedSpan.value = chooseDefaultSpan(result.data.list);
    latestSource.value = result.sourceUsed;
    warningMessage.value = result.warning ?? '';
    lastUpdatedAt.value = new Date();
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = `链路详情加载失败，请稍后重试。原因：${message}`;
    spans.value = [];
    selectedSpan.value = null;
  } finally {
    loading.value = false;
    syncPageMeta();
  }
}

watch(
  () => [props.source, props.id, dataMode.value] as const,
  () => {
    void loadDetail();
  },
  { immediate: true },
);

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

.header-main {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.back-btn {
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  background: #f8fafc;
  padding: 10px 14px;
  color: var(--ink-strong);
  font-weight: 700;
  cursor: pointer;
  transition: transform var(--motion-fast) ease;
}

.back-btn:hover {
  transform: translateY(-1px);
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--ink-soft);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.page-header h2 {
  margin: 0;
  color: var(--ink-strong);
  font-family: 'IBM Plex Mono', monospace;
  word-break: break-all;
}

.desc {
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

.stats-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.content-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.42fr);
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
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .page-header,
  .header-main {
    flex-direction: column;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
