export interface SourcePolicy {
  source: string;
  publicPages: string;
  allowedData: string;
  blockedData: string;
  requestPolicy: string;
  defaultScope: string;
}

export const SOURCE_POLICIES: SourcePolicy[] = [
  {
    source: 'zuicool',
    publicPages: '公开报名页和公开赛事目录页',
    allowedData: '赛事名称、日期、城市、省份、距离、报名状态、公开报名链接',
    blockedData: '不抓登录后内容、不抓个人资料、不抓支付或报名表单字段',
    requestPolicy: '目录分页串行抓取，每页之间保留延迟；详情页仅在手动传入 --details 时抓取',
    defaultScope: '默认抓公开目录和公开报名页',
  },
  {
    source: 'nowrun',
    publicPages: '公开首页赛事链接和公开赛事详情页',
    allowedData: '结构化 race 对象中的赛事公开信息',
    blockedData: '不抓用户内容、不抓报名表单、不抓登录后页面',
    requestPolicy: '默认最多抓 492 个详情页，并限制并发与请求间隔',
    defaultScope: '默认抓首页公开发现的 492 个详情页；手动 limit 可缩小范围',
  },
  {
    source: 'chinarun',
    publicPages: '公开全程马拉松/半程马拉松列表页',
    allowedData: '赛事名称、日期、地点、报名状态、公开详情链接',
    blockedData: '强过滤直通名额、酒店套餐、旅游产品、线上跑、越野和缺少可信地点的数据',
    requestPolicy: '默认只抓每个分类第一页，分类之间保留延迟',
    defaultScope: '默认仅作为辅助报名源补充',
  },
  {
    source: 'marathonbm',
    publicPages: '公开赛事列表接口和公开赛事详情接口',
    allowedData: '赛事名称、比赛日期、省市区、报名状态、公开赛事详情链接',
    blockedData: '不抓登录态、不抓报名表单、不抓参赛者个人资料或订单信息',
    requestPolicy: '默认最多读取 120 条公开列表，并按赛事详情低频补充地点',
    defaultScope: '默认作为辅助报名源补充公开报名赛事',
  },
];

export function getSourcePolicy(source: string): SourcePolicy | undefined {
  return SOURCE_POLICIES.find(policy => policy.source === source);
}
