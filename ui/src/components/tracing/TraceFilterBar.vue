<template>
  <section class="filter-shell">
    <div class="row">
      <label class="field wide">
        <span>链路 / 请求 ID</span>
        <input
          :value="filters.search_id"
          type="text"
          aria-label="链路或请求 ID"
          placeholder="输入链路 ID（TraceID）或请求 ID（RequestID）"
          @input="onField('search_id', ($event.target as HTMLInputElement).value)"
          @keyup.enter="emit('search')"
        />
      </label>

      <label class="field">
        <span>ID 模式</span>
        <select :value="filters.search_mode" aria-label="ID 模式" @change="onField('search_mode', ($event.target as HTMLSelectElement).value)">
          <option value="auto">自动</option>
          <option value="trace">链路 ID（TraceID）</option>
          <option value="request">请求 ID（RequestID）</option>
        </select>
      </label>

      <label class="field">
        <span>时间范围</span>
        <select :value="filters.range_id" aria-label="时间范围" @change="onField('range_id', ($event.target as HTMLSelectElement).value)">
          <option v-for="item in timeRangeOptions" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>

      <label class="field">
        <span>根类型</span>
        <select :value="filters.root_stage" aria-label="根类型" @change="onField('root_stage', ($event.target as HTMLSelectElement).value)">
          <option value="http.request">HTTP 请求</option>
          <option value="task">定时任务</option>
          <option value="all">全部</option>
        </select>
      </label>
    </div>

    <div class="row">
      <label class="field">
        <span>服务</span>
        <select :value="filters.service" aria-label="服务筛选" @change="onField('service', ($event.target as HTMLSelectElement).value)">
          <option value="">全部</option>
          <option v-for="item in serviceOptions" :key="item" :value="item">{{ toServiceDisplayLabel(item) }}</option>
        </select>
      </label>

      <label class="field">
        <span>状态</span>
        <select :value="filters.status" aria-label="状态筛选" @change="onField('status', ($event.target as HTMLSelectElement).value)">
          <option value="">全部</option>
          <option value="ok">成功</option>
          <option value="error">失败</option>
        </select>
      </label>

      <label class="field">
        <span>本地方法提示</span>
        <input
          :value="filters.method_hint"
          type="text"
          aria-label="本地方法提示"
          placeholder="仅用于本地二级过滤"
          @input="onField('method_hint', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="field">
        <span>本地路由提示</span>
        <input
          :value="filters.route_hint"
          type="text"
          aria-label="本地路由提示"
          placeholder="仅用于本地二级过滤"
          @input="onField('route_hint', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="field">
        <span>每页显示</span>
        <select :value="String(filters.page_size)" aria-label="每页数量" @change="onPageSizeChange(($event.target as HTMLSelectElement).value)">
          <option v-for="size in pageSizeOptions" :key="size" :value="String(size)">{{ size }}</option>
        </select>
      </label>

      <div class="actions">
        <button class="primary" :disabled="loading" aria-label="执行查询" @click="emit('search')">
          {{ loading ? '查询中...' : '查询' }}
        </button>
        <button class="ghost" :disabled="loading" aria-label="重置筛选条件" @click="emit('reset')">重置</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TimeRangeOption } from '../../types/common';
import type { TraceExplorerFilters } from '../../types/tracing';
import { toServiceDisplayLabel } from '../../utils/displayLabel';

interface Props {
  filters: TraceExplorerFilters;
  loading: boolean;
  timeRangeOptions: TimeRangeOption<TraceExplorerFilters['range_id']>[];
  serviceOptions: string[];
  pageSizeOptions: number[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'update:filters', value: TraceExplorerFilters): void;
  (event: 'search'): void;
  (event: 'reset'): void;
}>();

function onField<K extends keyof TraceExplorerFilters>(key: K, value: string): void {
  emit('update:filters', {
    ...props.filters,
    [key]: value,
  });
}

function onPageSizeChange(raw: string): void {
  const num = Number(raw);
  emit('update:filters', {
    ...props.filters,
    page_size: Number.isFinite(num) && num > 0 ? Math.floor(num) : props.filters.page_size,
  });
}
</script>

<style scoped>
.filter-shell {
  display: grid;
  gap: 12px;
  border-radius: 22px;
  border: 1px solid var(--panel-line);
  background: var(--panel-bg);
  padding: 18px;
  box-shadow: var(--panel-shadow);
}

.row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 6px;
  grid-column: span 2;
}

.field.wide {
  grid-column: span 4;
}

.field span {
  font-size: 0.74rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.field input,
.field select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  background: #ffffff;
  padding: 10px 12px;
  color: var(--ink-strong);
}

.actions {
  grid-column: span 2;
  display: flex;
  align-items: end;
  gap: 10px;
}

.actions button {
  border-radius: 12px;
  border: 1px solid var(--panel-line);
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  background: linear-gradient(135deg, #0f172a, #22324a);
  color: #f8fafc;
}

.ghost {
  background: #f8fafc;
  color: var(--ink-strong);
}

@media (max-width: 1280px) {
  .row {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .field,
  .field.wide,
  .actions {
    grid-column: span 2;
  }
}

@media (max-width: 820px) {
  .row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field,
  .field.wide,
  .actions {
    grid-column: span 2;
  }
}
</style>
