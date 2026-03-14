<template>
  <section class="chart-card">
    <header class="chart-header">
      <div>
        <h3>{{ title }}</h3>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="hasData" class="legend-list">
        <span v-for="entry in normalizedSeries" :key="entry.name" class="legend-item">
          <i :style="{ backgroundColor: entry.color }"></i>
          {{ entry.name }}
        </span>
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

      <g class="line-layer">
        <g v-for="entry in normalizedSeries" :key="entry.name">
          <path class="line-path" :d="entry.path" :stroke="entry.color" />
          <circle
            v-for="point in entry.highlightPoints"
            :key="`${entry.name}-${point.index}`"
            class="line-point"
            :cx="point.x"
            :cy="point.y"
            :fill="entry.color"
            r="3"
          />
        </g>
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

interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    labels: string[];
    series: LineSeries[];
    unit?: string;
    decimals?: number;
    loading?: boolean;
  }>(),
  {
    subtitle: '',
    unit: '',
    decimals: 0,
    loading: false,
  },
);

const VIEWBOX = { width: 760, height: 288 };
const PADDING = { top: 20, right: 18, bottom: 42, left: 64 };

const plotWidth = VIEWBOX.width - PADDING.left - PADDING.right;
const plotHeight = VIEWBOX.height - PADDING.top - PADDING.bottom;

const dataLength = computed(() => {
  const maxSeriesLen = props.series.reduce((max, item) => Math.max(max, item.values.length), 0);
  return Math.max(props.labels.length, maxSeriesLen);
});

const hasData = computed(() => dataLength.value > 0 && props.series.some((item) => item.values.length > 0));

const maxValue = computed(() => {
  const rawMax = props.series.reduce((max, item) => {
    const innerMax = item.values.reduce((localMax, value) => Math.max(localMax, value), 0);
    return Math.max(max, innerMax);
  }, 0);
  if (rawMax <= 0) return 1;
  return rawMax * 1.1;
});

function getX(index: number): number {
  if (dataLength.value <= 1) return PADDING.left;
  return PADDING.left + (index / (dataLength.value - 1)) * plotWidth;
}

function getY(value: number): number {
  const clamped = Math.max(0, value);
  return PADDING.top + plotHeight - (clamped / maxValue.value) * plotHeight;
}

function buildPath(values: number[]): string {
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${getX(index).toFixed(2)} ${getY(value).toFixed(2)}`)
    .join(' ');
}

const normalizedSeries = computed(() => {
  return props.series.map((entry) => {
    const normalizedValues = Array.from({ length: dataLength.value }, (_, index) => entry.values[index] ?? 0);
    const points = normalizedValues.map((value, index) => ({ index, x: getX(index), y: getY(value) }));
    const step = Math.max(1, Math.floor(points.length / 16));
    const highlightPoints = points.filter((_point, idx) => idx % step === 0 || idx === points.length - 1);

    return {
      ...entry,
      values: normalizedValues,
      path: buildPath(normalizedValues),
      highlightPoints,
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
  if (dataLength.value === 1) {
    return [{ index: 0, x: getX(0), label: props.labels[0] ?? '' }];
  }

  const candidateIndexes = [0, Math.floor((dataLength.value - 1) / 3), Math.floor((2 * (dataLength.value - 1)) / 3), dataLength.value - 1];
  const uniqueIndexes = Array.from(new Set(candidateIndexes));
  return uniqueIndexes.map((index) => ({
    index,
    x: getX(index),
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

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.legend-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #3c5165;
  font-size: 0.78rem;
  font-weight: 600;
}

.legend-item i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
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

.line-path {
  fill: none;
  stroke-width: 2.2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.line-point {
  stroke: #ffffff;
  stroke-width: 1.4;
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
