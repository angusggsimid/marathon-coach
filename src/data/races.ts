/**
 * Seed race data — 2026–2027 China marathon season.
 * Dates are based on historical patterns; marked status='upcoming' until confirmed.
 * Source: manual curation (v1). Will be replaced by crawler data in v2.
 */

export type RaceDistance = 'full' | 'half' | '10k';
export type RaceTerrain  = 'flat' | 'hilly' | 'mountain';
export type RaceLabel    = 'iaaf-gold' | 'iaaf-silver' | 'iaaf-bronze' | null;
export type RaceStatus   = 'open' | 'closed' | 'upcoming' | 'cancelled' | 'postponed';

export interface RaceEvent {
  id: string;
  name: string;
  date: string;                 // 'YYYY-MM-DD'
  city: string;
  province: string;
  distances: RaceDistance[];
  terrain: RaceTerrain;
  label: RaceLabel;
  status: RaceStatus;
  altitude?: number;            // metres above sea level (notable if >1500)
  registrationUrl?: string;
  note?: string;
  sources?: string[];
}

export const RACES: RaceEvent[] = [
  // ── May 2026 ──────────────────────────────────────────────────────────────
  {
    id: 'jinan-2026',
    name: '济南马拉松',
    date: '2026-05-03',
    city: '济南', province: '山东',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'weifang-2026',
    name: '潍坊马拉松',
    date: '2026-05-03',
    city: '潍坊', province: '山东',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'dalian-2026',
    name: '大连马拉松',
    date: '2026-05-10',
    city: '大连', province: '辽宁',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '沿海赛道，风景优美',
  },
  {
    id: 'rizhao-2026',
    name: '日照马拉松',
    date: '2026-05-17',
    city: '日照', province: '山东',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'qingdao-2026',
    name: '青岛马拉松',
    date: '2026-05-17',
    city: '青岛', province: '山东',
    distances: ['full', 'half'],
    terrain: 'hilly', label: null, status: 'upcoming',
    note: '起伏赛道，沿海城市风光',
  },
  {
    id: 'lianyungang-2026',
    name: '连云港马拉松',
    date: '2026-05-24',
    city: '连云港', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'lanzhou-2026',
    name: '兰州马拉松',
    date: '2026-05-31',
    city: '兰州', province: '甘肃',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '黄河沿岸赛道',
  },

  // ── June 2026 ─────────────────────────────────────────────────────────────
  {
    id: 'guiyang-2026',
    name: '贵阳马拉松',
    date: '2026-06-14',
    city: '贵阳', province: '贵州',
    distances: ['full', 'half'],
    terrain: 'hilly', label: null, status: 'upcoming',
    altitude: 1071,
  },
  {
    id: 'harbin-2026',
    name: '哈尔滨马拉松',
    date: '2026-06-21',
    city: '哈尔滨', province: '黑龙江',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── July 2026 ─────────────────────────────────────────────────────────────
  {
    id: 'xining-2026',
    name: '西宁马拉松',
    date: '2026-07-12',
    city: '西宁', province: '青海',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    altitude: 2200,
    note: '高海拔赛事，建议提前适应',
  },
  {
    id: 'lhasa-2026',
    name: '拉萨马拉松',
    date: '2026-07-19',
    city: '拉萨', province: '西藏',
    distances: ['full', 'half'],
    terrain: 'mountain', label: null, status: 'upcoming',
    altitude: 3650,
    note: '世界最高城市马拉松之一，仅限适应高海拔跑者',
  },

  // ── August 2026 ───────────────────────────────────────────────────────────
  {
    id: 'yinchuan-2026',
    name: '银川马拉松',
    date: '2026-08-09',
    city: '银川', province: '宁夏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── September 2026 ────────────────────────────────────────────────────────
  {
    id: 'urumqi-2026',
    name: '乌鲁木齐马拉松',
    date: '2026-09-06',
    city: '乌鲁木齐', province: '新疆',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'changchun-2026',
    name: '长春马拉松',
    date: '2026-09-13',
    city: '长春', province: '吉林',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'shenyang-2026',
    name: '沈阳马拉松',
    date: '2026-09-20',
    city: '沈阳', province: '辽宁',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'zhengzhou-2026',
    name: '郑州马拉松',
    date: '2026-09-20',
    city: '郑州', province: '河南',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: 'iaaf-silver', status: 'upcoming',
  },
  {
    id: 'zhangjiakou-2026',
    name: '张家口马拉松',
    date: '2026-09-27',
    city: '张家口', province: '河北',
    distances: ['full', 'half'],
    terrain: 'hilly', label: null, status: 'upcoming',
  },
  {
    id: 'tangshan-2026',
    name: '唐山马拉松',
    date: '2026-09-27',
    city: '唐山', province: '河北',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── October 2026 ──────────────────────────────────────────────────────────
  {
    id: 'ningbo-2026',
    name: '宁波马拉松',
    date: '2026-10-11',
    city: '宁波', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'changsha-2026',
    name: '长沙马拉松',
    date: '2026-10-11',
    city: '长沙', province: '湖南',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'luoyang-2026',
    name: '洛阳马拉松',
    date: '2026-10-11',
    city: '洛阳', province: '河南',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '途经龙门石窟景区',
  },
  {
    id: 'beijing-2026',
    name: '北京马拉松',
    date: '2026-10-18',
    city: '北京', province: '北京',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '中国历史最悠久马拉松，天安门起跑',
  },
  {
    id: 'tianjin-2026',
    name: '天津马拉松',
    date: '2026-10-18',
    city: '天津', province: '天津',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'kunming-2026',
    name: '昆明马拉松',
    date: '2026-10-18',
    city: '昆明', province: '云南',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    altitude: 1891,
    note: '春城高原赛事，气候宜人',
  },
  {
    id: 'huaian-2026',
    name: '淮安马拉松',
    date: '2026-10-18',
    city: '淮安', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'taiyuan-2026',
    name: '太原马拉松',
    date: '2026-10-25',
    city: '太原', province: '山西',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'shijiazhuang-2026',
    name: '石家庄马拉松',
    date: '2026-10-25',
    city: '石家庄', province: '河北',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'yantai-2026',
    name: '烟台马拉松',
    date: '2026-10-25',
    city: '烟台', province: '山东',
    distances: ['full', 'half'],
    terrain: 'hilly', label: null, status: 'upcoming',
  },
  {
    id: 'linyi-2026',
    name: '临沂马拉松',
    date: '2026-10-25',
    city: '临沂', province: '山东',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── November 2026 ─────────────────────────────────────────────────────────
  {
    id: 'chengdu-2026',
    name: '成都马拉松',
    date: '2026-11-01',
    city: '成都', province: '四川',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '途经天府广场、金沙遗址',
  },
  {
    id: 'hefei-2026',
    name: '合肥马拉松',
    date: '2026-11-01',
    city: '合肥', province: '安徽',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'hangzhou-2026',
    name: '杭州马拉松',
    date: '2026-11-08',
    city: '杭州', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-silver', status: 'upcoming',
    note: '途经西湖景区',
  },
  {
    id: 'xian-2026',
    name: '西安马拉松',
    date: '2026-11-08',
    city: '西安', province: '陕西',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '历史古城赛道',
  },
  {
    id: 'jiaxing-2026',
    name: '嘉兴马拉松',
    date: '2026-11-08',
    city: '嘉兴', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'nanjing-2026',
    name: '南京马拉松',
    date: '2026-11-15',
    city: '南京', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-silver', status: 'upcoming',
    note: '六朝古都，途经玄武湖',
  },
  {
    id: 'shaoxing-2026',
    name: '绍兴马拉松',
    date: '2026-11-15',
    city: '绍兴', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '水乡赛道',
  },
  {
    id: 'wenzhou-2026',
    name: '温州马拉松',
    date: '2026-11-22',
    city: '温州', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'nanchang-2026',
    name: '南昌马拉松',
    date: '2026-11-22',
    city: '南昌', province: '江西',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'quanzhou-2026',
    name: '泉州马拉松',
    date: '2026-11-22',
    city: '泉州', province: '福建',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '海上丝绸之路起点',
  },
  {
    id: 'shanghai-2026',
    name: '上海马拉松',
    date: '2026-11-29',
    city: '上海', province: '上海',
    distances: ['full'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '外滩起跑，中国报名最难马拉松',
  },
  {
    id: 'suzhou-2026',
    name: '苏州马拉松',
    date: '2026-11-29',
    city: '苏州', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '园林古城赛道',
  },
  {
    id: 'changzhou-2026',
    name: '常州马拉松',
    date: '2026-11-29',
    city: '常州', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'jinhua-2026',
    name: '金华马拉松',
    date: '2026-11-29',
    city: '金华', province: '浙江',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── December 2026 ─────────────────────────────────────────────────────────
  {
    id: 'guangzhou-2026',
    name: '广州马拉松',
    date: '2026-12-06',
    city: '广州', province: '广东',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '华南最大马拉松',
  },
  {
    id: 'shenzhen-2026',
    name: '深圳马拉松',
    date: '2026-12-13',
    city: '深圳', province: '广东',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-silver', status: 'upcoming',
  },
  {
    id: 'nanning-2026',
    name: '南宁马拉松',
    date: '2026-12-20',
    city: '南宁', province: '广西',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'haikou-2026',
    name: '海口马拉松',
    date: '2026-12-27',
    city: '海口', province: '海南',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '热带海岛赛事，冬季气温宜人',
  },

  // ── January 2027 ──────────────────────────────────────────────────────────
  {
    id: 'xiamen-2027',
    name: '厦门马拉松',
    date: '2027-01-03',
    city: '厦门', province: '福建',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '环岛路海景赛道，华南最具代表性马拉松',
  },
  {
    id: 'sanya-2027',
    name: '三亚马拉松',
    date: '2027-01-10',
    city: '三亚', province: '海南',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
    note: '热带滨海赛道',
  },
  {
    id: 'fuzhou-2027',
    name: '福州马拉松',
    date: '2027-01-17',
    city: '福州', province: '福建',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },

  // ── February 2027 ─────────────────────────────────────────────────────────
  {
    id: 'hongkong-2027',
    name: '香港马拉松',
    date: '2027-02-14',
    city: '香港', province: '香港',
    distances: ['full', 'half', '10k'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '亚洲参与规模最大马拉松之一',
  },

  // ── March 2027 ────────────────────────────────────────────────────────────
  {
    id: 'shanghai-half-2027',
    name: '上海半程马拉松',
    date: '2027-03-14',
    city: '上海', province: '上海',
    distances: ['half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'wuxi-2027',
    name: '无锡马拉松',
    date: '2027-03-21',
    city: '无锡', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '太湖之滨，国内 PB 圣地之一',
  },
  {
    id: 'chongqing-2027',
    name: '重庆马拉松',
    date: '2027-03-28',
    city: '重庆', province: '重庆',
    distances: ['full', 'half'],
    terrain: 'hilly', label: 'iaaf-silver', status: 'upcoming',
    note: '山城赛道，爬升挑战较大，风景独特',
  },

  // ── April 2027 ────────────────────────────────────────────────────────────
  {
    id: 'wuhan-2027',
    name: '武汉马拉松',
    date: '2027-04-04',
    city: '武汉', province: '湖北',
    distances: ['full', 'half'],
    terrain: 'flat', label: 'iaaf-gold', status: 'upcoming',
    note: '武汉长江大桥赛道',
  },
  {
    id: 'yangzhou-2027',
    name: '扬州鉴真国际半程马拉松',
    date: '2027-04-11',
    city: '扬州', province: '江苏',
    distances: ['half'],
    terrain: 'flat', label: 'iaaf-silver', status: 'upcoming',
    note: '专注半马，华东最具代表性半程赛事',
  },
  {
    id: 'beijing-half-2027',
    name: '北京国际长跑节（半马）',
    date: '2027-04-18',
    city: '北京', province: '北京',
    distances: ['half', '10k'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'xuzhou-2027',
    name: '徐州马拉松',
    date: '2027-04-18',
    city: '徐州', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
  {
    id: 'taizhou-2027',
    name: '泰州马拉松',
    date: '2027-04-25',
    city: '泰州', province: '江苏',
    distances: ['full', 'half'],
    terrain: 'flat', label: null, status: 'upcoming',
  },
];

// ── Helper utilities ────────────────────────────────────────────────────────

export const LABEL_CONFIG: Record<NonNullable<RaceLabel>, { text: string; color: string; bg: string }> = {
  'iaaf-gold':   { text: 'IAAF 金标', color: '#FFD60A', bg: 'rgba(255,214,10,0.15)' },
  'iaaf-silver': { text: 'IAAF 银标', color: '#98989D', bg: 'rgba(152,152,157,0.15)' },
  'iaaf-bronze': { text: 'IAAF 铜标', color: '#CD7F32', bg: 'rgba(205,127,50,0.15)' },
};

export const DISTANCE_LABEL: Record<RaceDistance, string> = {
  full: '全马 42.2km',
  half: '半马 21.1km',
  '10k': '10公里',
};

export const TERRAIN_LABEL: Record<RaceTerrain, string> = {
  flat: '平路',
  hilly: '起伏',
  mountain: '山地',
};

export const STATUS_CONFIG: Record<RaceStatus, { text: string; color: string }> = {
  open:      { text: '报名中',  color: 'var(--color-accent)' },
  closed:    { text: '报名截止', color: 'var(--color-label-3)' },
  upcoming:  { text: '即将开放', color: '#0A84FF' },
  cancelled: { text: '已取消',  color: 'var(--color-red)' },
  postponed: { text: '已延期',  color: 'var(--color-orange)' },
};
