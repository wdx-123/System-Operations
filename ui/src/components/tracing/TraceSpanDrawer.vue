<template>
  <aside class="drawer" v-if="span">
    <header class="drawer-header">
      <div>
        <h3>跨度详情</h3>
        <p>{{ span.span_id }} · {{ toTraceStatusLabel(span.status) }}</p>
      </div>
      <button class="close-btn" @click="emit('close')">×</button>
    </header>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="{ active: activeTab === tab.id, muted: tab.disabled }"
        :disabled="tab.disabled"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="panel" v-if="activeTab === 'overview'">
      <div class="kv"><span>链路 ID</span><code>{{ span.trace_id }}</code></div>
      <div class="kv"><span>请求 ID</span><code>{{ span.request_id }}</code></div>
      <div class="kv"><span>服务</span><strong>{{ toServiceDisplayLabel(span.service) }}</strong></div>
      <div class="kv"><span>阶段</span><strong>{{ span.stage || '-' }}</strong></div>
      <div class="kv"><span>类型</span><strong>{{ span.kind || '-' }}</strong></div>
      <div class="kv"><span>名称</span><strong>{{ span.name }}</strong></div>
      <div class="kv"><span>状态</span><strong :class="{ error: span.status === 'error' }">{{ toTraceStatusLabel(span.status) }}</strong></div>
      <div class="kv"><span>开始时间</span><strong>{{ formatDateTime(span.start_at) }}</strong></div>
      <div class="kv"><span>结束时间</span><strong>{{ formatDateTime(span.end_at) }}</strong></div>
      <div class="kv"><span>耗时</span><strong>{{ span.duration_ms }} ms</strong></div>
      <div class="kv" v-if="span.error_code"><span>错误码</span><strong class="error">{{ span.error_code }}</strong></div>
      <div class="kv" v-if="span.message"><span>消息</span><strong class="error">{{ span.message }}</strong></div>
    </div>

    <div class="panel" v-else-if="activeTab === 'tags'">
      <div v-if="tagEntries.length === 0" class="empty">无标签信息</div>
      <div v-else class="tag-list">
        <div v-for="[key, value] in tagEntries" :key="key" class="tag-row">
          <span class="tag-key">{{ key }}</span>
          <span class="tag-value">{{ value }}</span>
        </div>
      </div>
    </div>

    <div class="panel" v-else-if="activeTab === 'payload'">
      <div v-if="!hasPayload" class="empty">无载荷信息</div>
      <template v-else>
        <section v-if="span.request_snippet">
          <h4>请求</h4>
          <pre>{{ formatJSONLike(span.request_snippet) }}</pre>
        </section>
        <section v-if="span.response_snippet">
          <h4>响应</h4>
          <pre>{{ formatJSONLike(span.response_snippet) }}</pre>
        </section>
      </template>
    </div>

    <div class="panel" v-else>
      <div v-if="!hasErrorDetail" class="empty">无错误详情</div>
      <template v-else>
        <section v-if="span.error_stack">
          <h4>错误堆栈</h4>
          <pre class="error-block">{{ span.error_stack }}</pre>
        </section>
        <section v-if="span.error_detail_json">
          <h4>错误详情 JSON</h4>
          <pre class="error-block">{{ formatJSONLike(span.error_detail_json) }}</pre>
        </section>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TraceSpanResp } from '../../types/tracing';
import { toServiceDisplayLabel, toTraceStatusLabel } from '../../utils/displayLabel';

type DrawerTab = 'overview' | 'tags' | 'payload' | 'error';

const props = defineProps<{
  span: TraceSpanResp | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const activeTab = ref<DrawerTab>('overview');

watch(
  () => props.span?.span_id,
  () => {
    activeTab.value = 'overview';
  },
);

const tagEntries = computed(() => {
  if (!props.span?.tags) return [];
  return Object.entries(props.span.tags);
});

const hasPayload = computed(() => {
  const span = props.span;
  return Boolean(span && (span.request_snippet || span.response_snippet));
});

const hasErrorDetail = computed(() => {
  const span = props.span;
  return Boolean(span && (span.error_stack || span.error_detail_json || span.message || span.error_code));
});

const tabs = computed(() => [
  { id: 'overview' as const, label: '概览', disabled: false },
  { id: 'tags' as const, label: '标签', disabled: false },
  { id: 'payload' as const, label: '载荷', disabled: !hasPayload.value },
  { id: 'error' as const, label: '错误', disabled: !hasErrorDetail.value },
]);

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatJSONLike(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
</script>

<style scoped>
.drawer {
  width: min(430px, 100%);
  border: 1px solid #d8e7f8;
  border-radius: 18px;
  background: linear-gradient(145deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 12px 28px rgba(10, 38, 63, 0.08);
  display: flex;
  flex-direction: column;
  max-height: 100%;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #e3edf8;
}

.drawer-header h3 {
  margin: 0;
  color: #122b40;
}

.drawer-header p {
  margin: 4px 0 0;
  color: #5c748a;
  font-size: 0.78rem;
  font-family: 'IBM Plex Mono', monospace;
  word-break: break-all;
}

.close-btn {
  border: 1px solid #cfdef0;
  background: #ffffff;
  border-radius: 9px;
  width: 30px;
  height: 30px;
  font-size: 1.1rem;
  color: #3a5468;
  cursor: pointer;
}

.tabs {
  padding: 10px 12px 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tabs button {
  border: 1px solid #ccddf0;
  background: #f7fbff;
  border-radius: 999px;
  padding: 6px 11px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #436076;
  cursor: pointer;
}

.tabs button.active {
  background: #196fbb;
  border-color: #196fbb;
  color: #ffffff;
}

.tabs button.muted {
  opacity: 0.45;
  cursor: not-allowed;
}

.panel {
  padding: 12px 14px 14px;
  overflow: auto;
  min-height: 220px;
}

.kv {
  display: grid;
  grid-template-columns: 108px 1fr;
  gap: 8px;
  border-bottom: 1px dashed #e4edf8;
  padding: 8px 0;
  align-items: start;
}

.kv span {
  color: #597287;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}

.kv strong,
.kv code {
  color: #1f3d57;
  font-size: 0.86rem;
  word-break: break-word;
}

.kv code {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.78rem;
}

.kv .error {
  color: #b42318;
}

.tag-list {
  display: grid;
  gap: 8px;
}

.tag-row {
  border: 1px solid #d8e6f5;
  border-radius: 10px;
  background: #f8fcff;
  padding: 9px;
  display: grid;
  gap: 4px;
}

.tag-key {
  font-size: 0.73rem;
  font-weight: 700;
  color: #587187;
  font-family: 'IBM Plex Mono', monospace;
}

.tag-value {
  color: #20445f;
  font-size: 0.85rem;
  word-break: break-word;
}

section {
  margin-bottom: 14px;
}

section h4 {
  margin: 0 0 6px;
  color: #456175;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

pre {
  margin: 0;
  background: #12283a;
  color: #d9ebff;
  padding: 10px;
  border-radius: 8px;
  overflow: auto;
  font-size: 0.75rem;
  font-family: 'IBM Plex Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

pre.error-block {
  background: #fff4f4;
  color: #8e1d1d;
  border: 1px solid #f2b7b7;
}

.empty {
  border: 1px dashed #cadbec;
  border-radius: 10px;
  background: #f7fbff;
  min-height: 140px;
  display: grid;
  place-items: center;
  color: #647d91;
}

@media (max-width: 980px) {
  .drawer {
    width: 100%;
  }
}
</style>
