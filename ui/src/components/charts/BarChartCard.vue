<template>
  <section class="chart-card">
    <header class="chart-header">
      <div>
        <h3>{{ title }}</h3>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
    </header>

    <div v-if="loading" class="chart-loading skeleton-block" aria-label="图表加载中"></div>
    <div v-else-if="!hasData" class="chart-empty">暂无可用数据</div>

    <svg
      v-else
      class="chart-svg"
      :viewBox="`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="title"
    >
      <g class="grid-layer">
        <line
          v-for="tick in yTicks"
          :key="`y-${tick.value}`"
          :x1="PADDING.left"
          :x2="VIEWBOX.width - PADDING.right"
          :y1="tick.y"
          :y2="tick.y"
        />
      </g>

      <g class="bars-layer">
        <rect
          v-for="bar in bars"
          :key="`bar-${bar.index}`"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          :fill="color"
          rx="4"
        />
      </g>

      <g class="axis-labels">
        <text
          v-for="tick in yTicks"
          :key="`ylabel-${tick.value}`"
          :x="PADDING.left - 10"
          :y="tick.y + 4"
          text-anchor="end"
        >
          {{ formatValue(tick.value) }}
        </text>
      </g>

      <g class="axis-labels">
        <text
          v-for="tick in xTicks"
          :key="`xlabel-${tick.index}`"
          :x="tick.x"
          :y="VIEWBOX.height - 12"
          text-anchor="middle"
        >
          {{ tick.label }}
        </text>
      </g>
    </svg>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    labels: string[];
    values: number[];
    color?: string;
    unit?: string;
    decimals?: number;
    loading?: boolean;
  }>(),
  {
    subtitle: '',
    color: '#ff7a18',
    unit: '',
    decimals: 0,
    loading: false,
  },
);

const VIEWBOX = { width: 760, height: 288 };
const PADDING = { top: 20, right: 18, bottom: 42, left: 64 };

const plotWidth = VIEWBOX.width - PADDING.left - PADDING.right;
const plotHeight = VIEWBOX.height - PADDING.top - PADDING.bottom;

const dataLength = computed(() => Math.max(props.labels.length, props.values.length));
const hasData = computed(() => dataLength.value > 0 && props.values.some((item) => item > 0));

const normalizedValues = computed(() =>
  Array.from({ length: dataLength.value }, (_, index) => Math.max(0, props.values[index] ?? 0)),
);

const maxValue = computed(() => {
  const value = normalizedValues.value.reduce((max, entry) => Math.max(max, entry), 0);
  if (value <= 0) return 1;
  return value * 1.1;
});

function getY(value: number): number {
  return PADDING.top + plotHeight - (Math.max(0, value) / maxValue.value) * plotHeight;
}

const bars = computed(() => {
  if (dataLength.value === 0) return [];
  const columnWidth = plotWidth / dataLength.value;
  const barWidth = Math.max(2, Math.min(24, columnWidth * 0.58));

  return normalizedValues.value.map((value, index) => {
    const height = (Math.max(0, value) / maxValue.value) * plotHeight;
    const x = PADDING.left + columnWidth * index + (columnWidth - barWidth) / 2;
    const y = getY(value);

    return {
      index,
      x,
      y,
      width: barWidth,
      height,
    };
  });
});

const yTicks = computed(() => {
  const steps = 4;
  return Array.from({ length: steps + 1 }, (_, idx) => {
    const value = (maxValue.value / steps) * idx;
    return {
      value,
      y: getY(value),
    };
  }).reverse();
});

const xTicks = computed(() => {
  if (dataLength.value === 0) return [];
  const candidateIndexes = [0, Math.floor((dataLength.value - 1) / 3), Math.floor((2 * (dataLength.value - 1)) / 3), dataLength.value - 1];
  const uniqueIndexes = Array.from(new Set(candidateIndexes));
  const step = plotWidth / Math.max(1, dataLength.value);

  return uniqueIndexes.map((index) => ({
    index,
    x: PADDING.left + step * index + step / 2,
    label: props.labels[index] ?? '',
  }));
});

function formatValue(value: number): string {
  const fixed = value.toFixed(props.decimals);
  return props.unit ? `${fixed}${props.unit}` : fixed;
}
</script>

<style scoped>
.chart-card {
  background: linear-gradient(145deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #dbe8f7;
  border-radius: 20px;
  padding: 16px 16px 14px;
  box-shadow: 0 14px 30px rgba(15, 45, 72, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 340px;
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.chart-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 34px rgba(15, 45, 72, 0.12);
}

.chart-loading {
  min-height: 260px;
}

.chart-header h3 {
  margin: 0;
  color: #11263a;
  font-size: 1rem;
  font-weight: 700;
}

.chart-header p {
  margin: 4px 0 0;
  color: #5f7385;
  font-size: 0.82rem;
}

.chart-empty {
  border: 1px dashed #c8d8ea;
  border-radius: 14px;
  min-height: 260px;
  display: grid;
  place-items: center;
  color: #6c8094;
  font-size: 0.9rem;
  background: rgba(247, 251, 255, 0.9);
}

.chart-svg {
  width: 100%;
  height: 260px;
}

.grid-layer line {
  stroke: #e7eef7;
  stroke-width: 1;
}

.axis-labels text {
  fill: #6b7f92;
  font-size: 11px;
  font-weight: 600;
  font-family: 'IBM Plex Mono', monospace;
}

.bars-layer rect {
  opacity: 0.88;
}

@media (max-width: 768px) {
  .chart-card {
    border-radius: 16px;
    min-height: 300px;
  }

  .chart-svg {
    height: 230px;
  }
}
</style>
