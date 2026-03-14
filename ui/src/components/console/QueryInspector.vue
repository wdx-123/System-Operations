<template>
  <details class="inspector" :open="open">
    <summary>
      <span>查询检查器</span>
      <small>{{ summaryText }}</small>
    </summary>

    <div class="items">
      <article v-for="item in items" :key="item.label" class="item">
        <header>
          <strong>{{ item.label }}</strong>
          <span v-if="item.sourceUsed" class="source-pill" :class="item.sourceUsed">{{ sourceLabel(item.sourceUsed) }}</span>
        </header>
        <pre>{{ typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload, null, 2) }}</pre>
      </article>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DataSourceMode } from '../../types/common';
import { toDataSourceLabel } from '../../utils/displayLabel';

interface InspectorItem {
  label: string;
  payload: unknown;
  sourceUsed?: DataSourceMode;
}

const props = withDefaults(
  defineProps<{
    items: InspectorItem[];
    open?: boolean;
  }>(),
  {
    open: false,
  },
);

const summaryText = computed(() => `共 ${props.items.length} 条请求参数`);

function sourceLabel(source: DataSourceMode): string {
  return toDataSourceLabel(source);
}
</script>

<style scoped>
.inspector {
  border: 1px solid var(--panel-line);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--panel-muted), rgba(245, 248, 252, 0.7));
  overflow: hidden;
}

summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-weight: 700;
  color: var(--ink-strong);
}

summary::-webkit-details-marker {
  display: none;
}

summary small {
  color: var(--ink-soft);
  font-weight: 600;
}

.items {
  display: grid;
  gap: 12px;
  padding: 0 16px 16px;
}

.item {
  border-radius: 14px;
  border: 1px solid rgba(133, 149, 169, 0.18);
  background: rgba(255, 255, 255, 0.8);
  overflow: hidden;
}

.item header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border-bottom: 1px solid rgba(133, 149, 169, 0.14);
}

.source-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.72rem;
  font-weight: 700;
}

.source-pill.mock {
  background: rgba(208, 233, 255, 0.9);
  color: #0b5182;
}

.source-pill.api {
  background: rgba(221, 245, 224, 0.95);
  color: #14633d;
}

pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: #d2e7ff;
  background: #101a27;
  font-size: 0.78rem;
  font-family: 'IBM Plex Mono', monospace;
}
</style>
