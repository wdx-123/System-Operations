import { createRouter, createWebHistory } from 'vue-router';
import OverviewPage from '../pages/OverviewPage.vue';
import RuntimePage from '../pages/RuntimePage.vue';
import TraceDetailPage from '../pages/TraceDetailPage.vue';
import TraceExplorerPage from '../pages/TraceExplorerPage.vue';
import type { TraceDetailSource } from '../types/tracing';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/overview' },
    { path: '/dashboard', redirect: '/overview' },
    {
      path: '/overview',
      name: 'overview',
      component: OverviewPage,
    },
    {
      path: '/runtime',
      name: 'runtime',
      component: RuntimePage,
    },
    {
      path: '/trace/explorer',
      name: 'trace-explorer',
      component: TraceExplorerPage,
    },
    {
      path: '/trace/detail/:id',
      name: 'trace-detail',
      component: TraceDetailPage,
      props: (route) => ({
        id: String(route.params.id ?? ''),
        source: (route.query.idType === 'request' ? 'request' : 'trace') as TraceDetailSource,
      }),
    },
    {
      path: '/trace/detail/trace/:traceId',
      redirect: (route) => ({
        name: 'trace-detail',
        params: { id: String(route.params.traceId ?? '') },
        query: { idType: 'trace' },
      }),
    },
    {
      path: '/trace/detail/request/:requestId',
      redirect: (route) => ({
        name: 'trace-detail',
        params: { id: String(route.params.requestId ?? '') },
        query: { idType: 'request' },
      }),
    },
    { path: '/:pathMatch(.*)*', redirect: '/overview' },
  ],
});

export default router;
