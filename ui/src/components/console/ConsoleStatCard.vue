<template>
  <article class="stat-card" :class="tone">
    <p class="label">{{ label }}</p>
    <h3>{{ value }}</h3>
    <small v-if="hint">{{ hint }}</small>
  </article>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'good' | 'warn' | 'danger';
  }>(),
  {
    hint: '',
    tone: 'default',
  },
);
</script>

<style scoped>
.stat-card {
  border-radius: 18px;
  padding: 16px;
  min-height: 118px;
  background: linear-gradient(180deg, rgba(16, 26, 39, 0.92), rgba(16, 26, 39, 0.82));
  border: 1px solid rgba(98, 117, 142, 0.22);
  color: #f3f7fb;
  display: grid;
  gap: 8px;
  box-shadow: 0 16px 28px rgba(11, 18, 29, 0.14);
  transition: transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 32px rgba(11, 18, 29, 0.18);
}

.label {
  margin: 0;
  color: #9eb2c8;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

h3 {
  margin: 0;
  font-size: clamp(1.4rem, 2vw, 1.95rem);
  line-height: 1.05;
}

small {
  color: #c4d0de;
  font-size: 0.8rem;
}

.good {
  background: linear-gradient(180deg, rgba(12, 42, 31, 0.98), rgba(12, 42, 31, 0.88));
}

.warn {
  background: linear-gradient(180deg, rgba(65, 40, 5, 0.98), rgba(65, 40, 5, 0.88));
}

.danger {
  background: linear-gradient(180deg, rgba(65, 18, 21, 0.98), rgba(65, 18, 21, 0.88));
}
</style>
