<template>
  <section class="waterfall-card">
    <header class="wf-header">
      <div class="wf-title">
        <h3>链路瀑布图</h3>
        <p>按调用关系展开 Span，点击任意行查看详情。</p>
      </div>
      <div class="wf-stats" v-if="stats">
        <span>跨度数: {{ stats.totalSpans }}</span>
        <span>服务数: {{ stats.serviceCount }}</span>
        <span :class="{ error: stats.errorCount > 0 }">错误数: {{ stats.errorCount }}</span>
        <span>总耗时: {{ formatMs(stats.durationMs) }}</span>
      </div>
    </header>

    <div v-if="loading && rows.length === 0" class="state-block">加载中...</div>
    <div v-else-if="rows.length === 0" class="state-block">暂无可展示的 Span 数据</div>

    <div v-else class="wf-body">
      <div class="wf-table-head">
        <div class="head-left">服务 / 操作</div>
        <div class="head-right">
          <span v-for="tick in ticks" :key="tick.label" class="tick" :style="{ left: `${tick.percent}%` }">
            {{ tick.label }}
          </span>
        </div>
      </div>

      <div class="wf-table">
        <div
          v-for="row in rows"
          :key="row.span_id"
          class="wf-row"
          :class="{ selected: selectedSpanId === row.span_id }"
          @click="emit('select', row)"
        >
          <div class="cell-left" :style="{ paddingLeft: `${row.depth * 20 + 10}px` }">
            <button
              class="expand-btn"
              :class="{ hidden: !row.hasChildren }"
              @click.stop="toggleExpand(row.span_id)"
            >
              {{ isExpanded(row.span_id) ? '▾' : '▸' }}
            </button>
            <span class="service">{{ toServiceDisplayLabel(row.service) }}</span>
            <span class="stage">{{ row.stage || '-' }}</span>
            <span class="name" :title="row.name">{{ row.name }}</span>
            <span class="dur">{{ row.duration_ms }}ms</span>
          </div>

          <div class="cell-right">
            <div class="bg-grid">
              <i style="left: 25%"></i>
              <i style="left: 50%"></i>
              <i style="left: 75%"></i>
              <i style="left: 100%"></i>
            </div>
            <div
              class="bar"
              :class="{ error: row.status === 'error' }"
              :style="{ left: `${row.offsetPercent}%`, width: `${Math.max(row.widthPercent, 0.2)}%` }"
            >
              <span v-if="row.widthPercent > 11">{{ row.duration_ms }}ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TraceSpanResp } from '../../types/tracing';
import { toServiceDisplayLabel } from '../../utils/displayLabel';

interface WaterfallRow extends TraceSpanResp {
  depth: number;
  hasChildren: boolean;
  offsetPercent: number;
  widthPercent: number;
  startMs: number;
  endMs: number;
  children: WaterfallRow[];
}

interface WaterfallStats {
  totalSpans: number;
  serviceCount: number;
  errorCount: number;
  durationMs: number;
}

const props = withDefaults(
  defineProps<{
    spans: TraceSpanResp[];
    selectedSpanId?: string | null;
    loading?: boolean;
  }>(),
  {
    selectedSpanId: null,
    loading: false,
  },
);

const emit = defineEmits<{
  (event: 'select', row: TraceSpanResp): void;
}>();

const expandedMap = ref<Record<string, boolean>>({});

watch(
  () => props.spans,
  (list) => {
    const next: Record<string, boolean> = {};
    for (const item of list) {
      next[item.span_id] = true;
    }
    expandedMap.value = next;
  },
  { immediate: true },
);

function parseStart(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseEnd(value: string, startMs: number, durationMs: number): number {
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  return startMs + Math.max(0, durationMs);
}

function isExpanded(spanId: string): boolean {
  return expandedMap.value[spanId] ?? true;
}

function toggleExpand(spanId: string): void {
  expandedMap.value = {
    ...expandedMap.value,
    [spanId]: !isExpanded(spanId),
  };
}

const transformed = computed(() => {
  const source = props.spans;
  const map = new Map<string, WaterfallRow>();
  const validRows: WaterfallRow[] = [];

  for (const span of source) {
    const startMs = parseStart(span.start_at);
    if (!Number.isFinite(startMs)) continue;
    const endMs = parseEnd(span.end_at, startMs, span.duration_ms);
    const row: WaterfallRow = {
      ...span,
      startMs,
      endMs,
      depth: 0,
      hasChildren: false,
      offsetPercent: 0,
      widthPercent: 0,
      children: [],
    };
    map.set(row.span_id, row);
    validRows.push(row);
  }

  if (validRows.length === 0) {
    return {
      rows: [] as WaterfallRow[],
      stats: null as WaterfallStats | null,
      ticks: [] as Array<{ percent: number; label: string }>,
    };
  }

  const roots: WaterfallRow[] = [];
  const firstRow = validRows[0];
  if (!firstRow) {
    return {
      rows: [] as WaterfallRow[],
      stats: null as WaterfallStats | null,
      ticks: [] as Array<{ percent: number; label: string }>,
    };
  }
  let minStart = firstRow.startMs;
  let maxEnd = firstRow.endMs;

  for (const row of validRows) {
    minStart = Math.min(minStart, row.startMs);
    maxEnd = Math.max(maxEnd, row.endMs);
    const parent = row.parent_span_id ? map.get(row.parent_span_id) : undefined;
    if (parent) {
      parent.children.push(row);
      parent.hasChildren = true;
    } else {
      roots.push(row);
    }
  }

  const durationMs = Math.max(1, maxEnd - minStart);

  function sortAndAnnotate(nodes: WaterfallRow[], depth: number): void {
    nodes.sort((a, b) => a.startMs - b.startMs);
    for (const node of nodes) {
      node.depth = depth;
      node.offsetPercent = ((node.startMs - minStart) / durationMs) * 100;
      node.widthPercent = (Math.max(0, node.duration_ms) / durationMs) * 100;
      if (node.children.length > 0) {
        sortAndAnnotate(node.children, depth + 1);
      }
    }
  }

  sortAndAnnotate(roots, 0);

  const flat: WaterfallRow[] = [];
  function flatten(nodes: WaterfallRow[]): void {
    for (const node of nodes) {
      flat.push(node);
      if (node.children.length > 0 && isExpanded(node.span_id)) {
        flatten(node.children);
      }
    }
  }
  flatten(roots);

  const errorCount = validRows.filter((item) => item.status === 'error').length;
  const serviceCount = new Set(validRows.map((item) => item.service)).size;
  const ticks = [0, 25, 50, 75, 100].map((percent) => ({
    percent,
    label: `${Math.round((durationMs * percent) / 100)}ms`,
  }));

  return {
    rows: flat,
    stats: {
      totalSpans: validRows.length,
      serviceCount,
      errorCount,
      durationMs,
    },
    ticks,
  };
});

const rows = computed(() => transformed.value.rows);
const stats = computed(() => transformed.value.stats);
const ticks = computed(() => transformed.value.ticks);

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}
</script>

<style scoped>
.waterfall-card {
  background: linear-gradient(145deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #d8e7f8;
  border-radius: 18px;
  padding: 14px;
  box-shadow: 0 12px 28px rgba(10, 38, 63, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 460px;
}

.wf-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.wf-title h3 {
  margin: 0;
  color: #11263a;
  font-size: 1.02rem;
}

.wf-title p {
  margin: 4px 0 0;
  color: #5f7488;
  font-size: 0.82rem;
}

.wf-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wf-stats span {
  background: #f4f9ff;
  border: 1px solid #cfe0f2;
  color: #2a4862;
  font-size: 0.77rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
}

.wf-stats span.error {
  color: #a72b2b;
  border-color: #f1c0c0;
  background: #fff3f3;
}

.state-block {
  border: 1px dashed #c7d7ea;
  border-radius: 12px;
  background: #f7fbff;
  min-height: 340px;
  display: grid;
  place-items: center;
  color: #60778c;
}

.wf-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.wf-table-head,
.wf-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(360px, 2fr);
  gap: 10px;
}

.head-left,
.head-right {
  color: #4f687e;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.head-right {
  position: relative;
  padding-right: 6px;
}

.tick {
  position: absolute;
  transform: translateX(-50%);
}

.wf-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  max-height: 520px;
  padding-right: 2px;
}

.wf-row {
  border: 1px solid #e0ebf8;
  border-radius: 10px;
  background: #ffffff;
  min-height: 40px;
  cursor: pointer;
}

.wf-row.selected {
  border-color: #5aa5ec;
  box-shadow: inset 0 0 0 1px rgba(90, 165, 236, 0.3);
}

.cell-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 8px 8px 8px 10px;
}

.expand-btn {
  border: none;
  background: transparent;
  color: #2f506a;
  width: 18px;
  min-width: 18px;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
}

.expand-btn.hidden {
  visibility: hidden;
}

.service {
  background: #ecf5ff;
  color: #1b4f84;
  border: 1px solid #c5dcf3;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 0.72rem;
  font-weight: 700;
}

.stage {
  background: #f6f9fd;
  color: #5a7186;
  border: 1px solid #d5e2f0;
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 0.7rem;
  font-weight: 700;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #20435f;
  font-size: 0.85rem;
}

.dur {
  color: #5d7388;
  font-size: 0.75rem;
  font-weight: 700;
  margin-left: auto;
}

.cell-right {
  position: relative;
  min-height: 38px;
  padding: 8px 8px;
}

.bg-grid i {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: #e8eef6;
}

.bar {
  position: absolute;
  top: 11px;
  bottom: 11px;
  border-radius: 999px;
  background: linear-gradient(120deg, #1ea4dd, #2d67c9);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 7px;
  color: #eff6ff;
  font-size: 0.7rem;
  font-weight: 700;
  overflow: hidden;
}

.bar.error {
  background: linear-gradient(120deg, #ef4444, #b91c1c);
}

@media (max-width: 920px) {
  .wf-table-head,
  .wf-row {
    grid-template-columns: 1fr;
  }

  .head-right {
    display: none;
  }

  .cell-right {
    min-height: 30px;
  }
}
</style>
