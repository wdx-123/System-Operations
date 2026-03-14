export const zhCN = {
  app: {
    brandKicker: '可观测平台',
    brandTitle: '观测工作台',
    brandDesc: 'API 优先，失败自动回退模拟数据',
    nav: {
      overview: '总览',
      runtime: '运行时',
      traceExplorer: '链路查询',
    },
    fallbackTitle: '工作台',
    fallbackDescription: '可观测控制台',
    notLoaded: '尚未加载',
    idle: '待命',
    manualRefresh: '手动刷新',
    loading: '加载中...',
  },
  common: {
    all: '全部',
    close: '关闭',
    refreshNow: '立即刷新',
    loading: '加载中...',
    noData: '暂无数据',
    fallbackMock: '当前为模拟数据',
  },
  overview: {
    title: 'HTTP 服务健康度',
    desc: '聚焦吞吐、错误与时延，按真实接口契约展示。',
  },
  runtime: {
    title: '任务、事件与 Outbox',
    desc: '并行调用运行时接口，覆盖序列与快照模式。',
  },
  traceExplorer: {
    title: '根链路摘要检索',
    desc: '查询根摘要列表，并可直接钻取详情。',
  },
  traceDetail: {
    title: '链路详情',
    back: '返回列表',
  },
} as const;

export type ZhCN = typeof zhCN;
