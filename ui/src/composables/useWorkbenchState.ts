import { computed, reactive, readonly, ref } from 'vue';
import type { DataSourceMode, UiCapabilities } from '../types/common';

export interface WorkbenchPageMeta {
  title: string;
  description: string;
  updatedAt: Date | null;
  loading: boolean;
  autoRefreshLabel?: string;
  statusLabel?: string;
}

const dataMode = ref<DataSourceMode>('api');
const pageMetaMap = reactive<Record<string, WorkbenchPageMeta>>({});
const uiCapabilities = readonly<UiCapabilities>({
  showDataSourceSwitch: Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DATA_SOURCE_SWITCH === 'true'),
  showQueryInspector: Boolean(import.meta.env.DEV),
});

function ensureMeta(pageKey: string): WorkbenchPageMeta {
  if (!pageMetaMap[pageKey]) {
    pageMetaMap[pageKey] = {
      title: '',
      description: '',
      updatedAt: null,
      loading: false,
      autoRefreshLabel: '',
      statusLabel: '',
    };
  }
  return pageMetaMap[pageKey];
}

export function useWorkbenchState() {
  function setDataMode(mode: DataSourceMode): void {
    dataMode.value = mode;
  }

  function setPageMeta(pageKey: string, meta: Partial<WorkbenchPageMeta>): void {
    pageMetaMap[pageKey] = {
      ...ensureMeta(pageKey),
      ...meta,
    };
  }

  function getPageMeta(pageKey: string): WorkbenchPageMeta {
    return ensureMeta(pageKey);
  }

  return {
    dataMode: readonly(dataMode),
    uiCapabilities,
    setDataMode,
    setPageMeta,
    getPageMeta,
    pageMetaMap: readonly(pageMetaMap),
  };
}

export function usePageMeta(pageKey: string) {
  const state = useWorkbenchState();
  return computed(() => state.getPageMeta(pageKey));
}
