<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useWorkbenchState } from './composables/useWorkbenchState';
import { zhCN } from './locales/zh-CN';
import { toDataSourceLabel } from './utils/displayLabel';

const route = useRoute();
const workbench = useWorkbenchState();
const t = zhCN;

const navItems = [
  { to: '/overview', label: t.app.nav.overview, icon: '01' },
  { to: '/runtime', label: t.app.nav.runtime, icon: '02' },
  { to: '/trace/explorer', label: t.app.nav.traceExplorer, icon: '03' },
];

const activeNav = computed(() => {
  if (route.path.startsWith('/trace')) return '/trace/explorer';
  if (route.path.startsWith('/runtime')) return '/runtime';
  return '/overview';
});

const activeMeta = computed(() => workbench.getPageMeta(String(route.name ?? 'overview')));
const sourceLabel = computed(() => toDataSourceLabel(workbench.dataMode.value));

const updatedAtText = computed(() => {
  const updatedAt = activeMeta.value.updatedAt;
  if (!updatedAt) return t.app.notLoaded;
  return updatedAt.toLocaleString('zh-CN', { hour12: false });
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <p class="brand-kicker">{{ t.app.brandKicker }}</p>
        <h1>{{ t.app.brandTitle }}</h1>
        <p class="brand-desc">{{ t.app.brandDesc }}</p>
      </div>

      <nav class="side-nav" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: activeNav === item.to }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="workspace">
      <header class="context-bar">
        <div>
          <p class="context-kicker">{{ activeMeta.title || t.app.fallbackTitle }}</p>
          <h2>{{ activeMeta.description || t.app.fallbackDescription }}</h2>
        </div>

        <div class="context-actions">
          <div v-if="workbench.uiCapabilities.showDataSourceSwitch" class="mode-switch">
            <button
              :class="{ active: workbench.dataMode.value === 'mock' }"
              aria-label="切换到模拟数据"
              @click="workbench.setDataMode('mock')"
            >
              模拟
            </button>
            <button
              :class="{ active: workbench.dataMode.value === 'api' }"
              aria-label="切换到实时 API"
              @click="workbench.setDataMode('api')"
            >
              实时 API
            </button>
          </div>

          <div class="context-meta">
            <span>数据源：{{ sourceLabel }}</span>
            <span>{{ activeMeta.statusLabel || t.app.idle }}</span>
            <span>{{ activeMeta.autoRefreshLabel || t.app.manualRefresh }}</span>
            <span>{{ activeMeta.loading ? t.app.loading : `更新于 ${updatedAtText}` }}</span>
          </div>
        </div>
      </header>

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  background:
    radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.12), transparent 20%),
    radial-gradient(circle at 100% 0%, rgba(14, 165, 233, 0.08), transparent 24%),
    linear-gradient(180deg, #eef2f7 0%, #f6f8fb 58%, #f0f4f8 100%);
}

.sidebar {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.98)),
    linear-gradient(180deg, #0f172a, #111827);
  color: #d9e1eb;
  padding: 22px 18px;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.brand-kicker,
.context-kicker {
  margin: 0 0 6px;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  font-weight: 700;
}

.brand h1 {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.15;
  color: #f8fafc;
}

.brand-desc {
  margin: 8px 0 0;
  color: #9fb0c5;
  font-size: 0.88rem;
}

.side-nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  color: #cad5e2;
  text-decoration: none;
  border: 1px solid transparent;
  transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
}

.nav-item:hover {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.24);
}

.nav-item.active {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(14, 165, 233, 0.14));
  border-color: rgba(125, 211, 252, 0.2);
  color: #eff6ff;
}

.nav-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(148, 163, 184, 0.12);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.78rem;
}

.workspace {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.context-bar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px 24px;
  background: rgba(246, 248, 251, 0.86);
  backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.context-bar h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.32rem;
}

.context-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: 14px;
  background: rgba(148, 163, 184, 0.16);
}

.mode-switch button {
  border: none;
  background: transparent;
  padding: 9px 14px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  color: #334155;
  transition: background-color 150ms ease, color 150ms ease;
}

.mode-switch button.active {
  background: #0f172a;
  color: #f8fafc;
}

.context-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.context-meta span {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #334155;
  font-size: 0.78rem;
  font-weight: 700;
}

.content {
  flex: 1;
  min-height: 0;
  padding: 24px;
}

.content > * {
  animation: fade-up 220ms ease;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .side-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .context-bar {
    position: relative;
    flex-direction: column;
    align-items: flex-start;
  }

  .context-actions {
    width: 100%;
    justify-content: space-between;
  }

  .side-nav {
    grid-template-columns: 1fr;
  }

  .content {
    padding: 18px 14px 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .content > * {
    animation: none;
  }

  .nav-item,
  .mode-switch button {
    transition: none;
  }
}
</style>
