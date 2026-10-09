/* ==========================================================================
   常量：纸张 / 桌面 / 分类色 / 排序方式
   新增类型时记得同步 server.js 的白名单与 styles.css（见 AGENTS.md 镜像同步表）
   ========================================================================== */

// 相对路径，兼容部署在 /my-memo/ 之类的子路径下
export const API_BASE = 'api';

export const PAPERS = [
  { id: 'lined',  name: '横格纸' },
  { id: 'grid',   name: '方格纸' },
  { id: 'plain',  name: '白纸' },
  { id: 'kraft',  name: '牛皮纸' },
  { id: 'sticky', name: '便签黄' },
  { id: 'mint',   name: '薄荷便签' }
];

export const PAPER_PREVIEW = {
  lined:  'repeating-linear-gradient(to bottom, transparent 0 4px, rgba(120,155,195,.55) 4px 5px), #fdfaf0',
  grid:   'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(120,155,195,.5) 3px 4px), repeating-linear-gradient(to right, transparent 0 3px, rgba(120,155,195,.5) 3px 4px), #fdfaf0',
  plain:  '#fffdf8',
  kraft:  'repeating-linear-gradient(72deg, rgba(120,85,40,.14) 0 1px, transparent 1px 4px), #d8bb8e',
  sticky: 'linear-gradient(180deg, #fff9c0, #fbf09a)',
  mint:   'linear-gradient(180deg, #dcf5e7, #c2e8d3)'
};

export const PAPER_IDS = PAPERS.map((p) => p.id);

// 由浅到深排列，浅色款存在感低，更适合长时间盯着看
export const DESKS = [
  { id: 'ash',   name: '浅灰' },
  { id: 'sand',  name: '暖砂' },
  { id: 'mist',  name: '雾蓝' },
  { id: 'oak',   name: '浅橡木' },
  { id: 'linen', name: '亚麻桌布' },
  { id: 'cork',  name: '软木板' },
  { id: 'wood',  name: '实木桌面' },
  { id: 'felt',  name: '墨绿毛毡' },
  { id: 'slate', name: '深色石板' }
];

export const DESK_IDS = DESKS.map((d) => d.id);

export const CAT_COLORS = ['#e8734a', '#e0a72e', '#6fae5a', '#4a90e2', '#8b6bb1', '#d95c8a', '#4fb3b3', '#8a8f98'];

export const SORTS = ['updated', 'created', 'title', 'manual'];

export const SETTINGS_DEFAULTS = { desk: 'wood', sort: 'updated', view: 'all', lastPaper: 'lined', order: [] };
