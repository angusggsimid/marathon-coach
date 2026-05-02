/**
 * Post check-in motivational quotes from famous marathon runners & coaches.
 * Categorized by completion status + RPE level + workout type.
 *
 * Selection avoids repeating the last 15 shown quotes (tracked in localStorage).
 */

export interface CheckInMessage {
  id: string;
  text: string;
  author: string;
}

// ─── Quote pools ──────────────────────────────────────────────────────────────

/** Full completion, normal effort (RPE 2) — general */
const FULL_GENERAL: CheckInMessage[] = [
  { id: 'f01', text: '只有自律的人，才能获得真正的自由。', author: '基普乔格' },
  { id: 'f02', text: '没有任何人类是有极限的。', author: '埃利乌德·基普乔格' },
  { id: 'f03', text: '马拉松教会我的，不是如何跑得更快，而是如何坚持下去。', author: '凯瑟琳·斯威策' },
  { id: 'f04', text: '想赢得什么，去跑100米。想体验什么，去跑马拉松。', author: '埃米尔·扎托佩克' },
  { id: 'f05', text: '跑步是一条通向自我认知的路。你推得越远，了解自己越深。', author: '弗兰克·肖特' },
  { id: 'f06', text: '比赛日你会感谢今天的自己。', author: '梅布·科夫莱吉' },
  { id: 'f07', text: '奇迹不是我跑完了全程，而是我有勇气站在起跑线上。', author: '约翰·宾厄姆' },
  { id: 'f08', text: '跑步不只是运动，它是一种生活方式。', author: '梅布·科夫莱吉' },
  { id: 'f09', text: '每天早晨你都有机会比昨天的自己跑得更远。', author: '沙拉娜·弗拉纳根' },
  { id: 'f10', text: '训练中的每一公里，都在比赛日偿还利息。', author: '哈尔·希格登' },
  { id: 'f11', text: '马拉松是一场壮观的赛事——它有戏剧，有历史，有竞争，也有镜子。', author: '葆拉·拉德克利夫' },
  { id: 'f12', text: '当你不想跑的那些天，才是真正在建造运动员的那些天。', author: '埃米尔·扎托佩克' },
  { id: 'f13', text: '如果你想了解人性，去看一场马拉松吧。', author: '凯瑟琳·斯威策' },
  { id: 'f14', text: '我不在乎速度有多慢，只要不停下来。', author: '村上春树' },
  { id: 'f15', text: '跑步让我诚实。身体不会说谎。', author: '迪西·林登' },
  { id: 'f16', text: '比赛是一瞬间的事，训练才是你真正生活的地方。', author: '弗兰克·肖特' },
  { id: 'f17', text: '你的双腿不是在追赶终点线，而是在离开起跑线。', author: '哈尔·希格登' },
  { id: 'f18', text: '每一步都算数，即使在最慢的那些日子里。', author: '琼·贝诺特·萨缪尔森' },
  { id: 'f19', text: '有氧基础是一切速度的母亲。慢跑，从不是在浪费时间。', author: '杰克·丹尼尔斯' },
  { id: 'f20', text: '跑步是我唯一能完全掌控的事情。', author: '迪西·林登' },
  { id: 'f21', text: '一百次的训练，造就一次完美的比赛。', author: '河内优辉' },
  { id: 'f22', text: '我跑，故我在。', author: '村上春树' },
  { id: 'f23', text: '最好的配速，是你能持续跑完全程的那个。', author: '杰克·丹尼尔斯' },
  { id: 'f24', text: '冠军不是在比赛日诞生的，而是在没人看见的那些训练里。', author: '基普乔格' },
  { id: 'f25', text: '坚持本身，就是一种才华。', author: '海勒·格布雷塞拉西' },
];

/** Full completion, hard effort (RPE 3–4) */
const FULL_HARD: CheckInMessage[] = [
  { id: 'h01', text: '痛苦是必经之路，苦难是主动选择。今天你选对了。', author: '村上春树' },
  { id: 'h02', text: '能把自己逼得更远的人，才是最终赢得比赛的人。', author: '罗杰·班尼斯特' },
  { id: 'h03', text: '当你以为自己到了极限，你才完成了50%。', author: '埃米尔·扎托佩克' },
  { id: 'h04', text: '今天很难，但你依然完成了。这就是训练的意义。', author: '梅布·科夫莱吉' },
  { id: 'h05', text: '那种撑过去的感觉，不是痛苦，是在变强的证明。', author: '基普乔格' },
  { id: 'h06', text: '有些日子你只是在生存，但生存也是一种胜利。', author: '迪西·林登' },
  { id: 'h07', text: '身体说停，你说再一步。运动员就是这样炼成的。', author: '海勒·格布雷塞拉西' },
  { id: 'h08', text: '最艰难的训练，往往是最有价值的训练。', author: '弗兰克·肖特' },
  { id: 'h09', text: '你不是在受苦，你是在投资。', author: '杰夫·盖洛韦' },
  { id: 'h10', text: '从未有人后悔完成了一次艰难的训练。', author: '沙拉娜·弗拉纳根' },
  { id: 'h11', text: '比赛日你不会记得今天有多累，只会记得你没有放弃。', author: '琼·贝诺特·萨缪尔森' },
  { id: 'h12', text: '每一次对抗疲劳的训练，都在重新定义你的极限。', author: '葆拉·拉德克利夫' },
];

/** Full completion, easy effort (RPE 0–1) */
const FULL_EASY: CheckInMessage[] = [
  { id: 'e01', text: '游刃有余地完成，这才是有氧基础建成的样子。', author: '杰克·丹尼尔斯' },
  { id: 'e02', text: '慢慢跑，是为了有一天可以快快跑。', author: '海勒·格布雷塞拉西' },
  { id: 'e03', text: '轻松的训练不是在偷懒，是在恢复，是在积累。', author: '哈尔·希格登' },
  { id: 'e04', text: '80% 的训练都应该是这种感觉。你在正确的路上。', author: '杰克·丹尼尔斯' },
  { id: 'e05', text: '跑得轻松，说明你的身体在驾驭这个配速，而不是被它驾驭。', author: '弗兰克·肖特' },
  { id: 'e06', text: '今天的轻松，是上周努力的成果。', author: '梅布·科夫莱吉' },
  { id: 'e07', text: '出门就是胜利，不论今天跑了多慢。', author: '村上春树' },
  { id: 'e08', text: '比赛靠爆发，马拉松靠积累。今天就是积累。', author: '河内优辉' },
];

/** Partial completion */
const PARTIAL: CheckInMessage[] = [
  { id: 'p01', text: '完成 > 完美。能出门，已经赢了大多数人。', author: '约翰·宾厄姆' },
  { id: 'p02', text: '明智地调整，比不顾一切地硬撑更专业。', author: '杰夫·盖洛韦' },
  { id: 'p03', text: '倾听身体，是最高级的训练技巧之一。', author: '杰克·丹尼尔斯' },
  { id: 'p04', text: '跑了一半，好过没跑。习惯的力量在于出现，不在于完美。', author: '哈尔·希格登' },
  { id: 'p05', text: '顶级运动员不是不累，是更懂得什么时候该停。', author: '葆拉·拉德克利夫' },
  { id: 'p06', text: '你今天的选择，是在保护明天的自己。', author: '迪西·林登' },
  { id: 'p07', text: '马拉松训练是一段漫长的旅程，今天只是其中一天。', author: '梅布·科夫莱吉' },
  { id: 'p08', text: '有时候，减少就是增加。', author: '埃米尔·扎托佩克' },
  { id: 'p09', text: '没有哪个计划是完美执行的，但每一步都算数。', author: '哈尔·希格登' },
  { id: 'p10', text: '你选择了诚实对待自己的身体。这需要勇气。', author: '琼·贝诺特·萨缪尔森' },
];

/** Skip / rest day */
const SKIP: CheckInMessage[] = [
  { id: 's01', text: '主动选择休息，是运动员才有的判断。', author: '基普乔格' },
  { id: 's02', text: '恢复不是软弱，是训练的一部分。', author: '杰克·丹尼尔斯' },
  { id: 's03', text: '今天的休息，是为了明天更好地跑。', author: '弗兰克·肖特' },
  { id: 's04', text: '身体在你睡着的时候变强，不是在你跑步的时候。', author: '杰夫·盖洛韦' },
  { id: 's05', text: '过度训练的代价，远比少跑一天大。', author: '葆拉·拉德克利夫' },
  { id: 's06', text: '最优秀的跑者，也是最懂得休息的跑者。', author: '海勒·格布雷塞拉西' },
  { id: 's07', text: '跑马拉松是一场持续数月的游戏，今天保存体力，才能撑到终点。', author: '梅布·科夫莱吉' },
  { id: 's08', text: '明天见，跑道还在那里。', author: '村上春树' },
];

/** LSD-specific (long slow distance) */
const LSD: CheckInMessage[] = [
  { id: 'l01', text: '马拉松的秘密不在赛场，在今天这样普通的长跑里。', author: '琼·贝诺特·萨缪尔森' },
  { id: 'l02', text: '今天跑的每一步，都会在比赛日替你说话。', author: '哈尔·希格登' },
  { id: 'l03', text: '有氧基础，是一切速度的地基。', author: '杰克·丹尼尔斯' },
  { id: 'l04', text: '长跑训练你的身体，也在训练你的心智。', author: '村上春树' },
  { id: 'l05', text: '你刚刚完成的距离，三个月前可能是你的极限。', author: '弗兰克·肖特' },
];

/** Tempo / threshold specific */
const TEMPO: CheckInMessage[] = [
  { id: 't01', text: '乳酸阈值又往上推了一点。这种感觉，就是在变快。', author: '杰克·丹尼尔斯' },
  { id: 't02', text: '节奏跑最难的不是配速，是在难受时保持住。你做到了。', author: '葆拉·拉德克利夫' },
  { id: 't03', text: 'Tempo 跑，是最接近比赛感觉的训练。今天你已经在比赛了。', author: '梅布·科夫莱吉' },
  { id: 't04', text: '不舒适区是进步发生的地方。今天你在那里待了够久。', author: '沙拉娜·弗拉纳根' },
  { id: 't05', text: '每一个节奏课都是在拓宽你的舒适配速区间。', author: '哈尔·希格登' },
];

/** Interval specific */
const INTERVAL: CheckInMessage[] = [
  { id: 'i01', text: '间歇课结束，身体正在做的事比你想象的复杂得多。', author: '杰克·丹尼尔斯' },
  { id: 'i02', text: '每一个 rep 都是在重新定义你的极限。', author: '海勒·格布雷塞拉西' },
  { id: 'i03', text: '间歇训练是最难的课，也是让你变最快的课。', author: '埃米尔·扎托佩克' },
  { id: 'i04', text: '速度不是天生的，是一次一次的间歇跑练出来的。', author: '弗兰克·肖特' },
  { id: 'i05', text: '你刚才经历的那种痛，就是身体在适应更快的速度。', author: '葆拉·拉德克利夫' },
];

// ─── Recently shown tracker ───────────────────────────────────────────────────

const STORAGE_KEY = 'marathon-checkin-recent';
const RECENT_LIMIT = 15;

function getRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function markShown(id: string) {
  const recent = getRecentIds();
  const updated = [id, ...recent.filter(r => r !== id)].slice(0, RECENT_LIMIT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

function pickFrom(pool: CheckInMessage[]): CheckInMessage | null {
  if (pool.length === 0) return null;
  const recent = getRecentIds();
  const fresh = pool.filter(m => !recent.includes(m.id));
  const source = fresh.length > 0 ? fresh : pool; // fall back to all if all seen
  return source[Math.floor(Math.random() * source.length)];
}

// ─── Public selector ──────────────────────────────────────────────────────────

export type WorkoutType = string;
export type CompletionStatus = 'full' | 'partial' | 'skip';

export function getCheckInMessage(
  status: CompletionStatus,
  rpe: number,
  workoutType: WorkoutType,
): CheckInMessage {
  let pool: CheckInMessage[];

  if (status === 'skip') {
    pool = SKIP;
  } else if (status === 'partial') {
    pool = PARTIAL;
  } else {
    // full completion — pick contextual pool
    const typePool: CheckInMessage[] =
      workoutType === 'LSD'                              ? LSD :
      workoutType === 'Tempo' || workoutType === 'TempoIntervals' || workoutType === 'Cruise' ? TEMPO :
      workoutType === 'Interval' || workoutType === 'Fartlek' ? INTERVAL :
      [];

    const rpePool: CheckInMessage[] =
      rpe >= 3 ? FULL_HARD :
      rpe <= 1 ? FULL_EASY :
      FULL_GENERAL;

    // 40% chance of workout-type specific quote (if available), otherwise RPE/general
    pool = typePool.length > 0 && Math.random() < 0.4
      ? [...typePool, ...rpePool]
      : rpePool;
  }

  const msg = pickFrom(pool) ?? FULL_GENERAL[0];
  markShown(msg.id);
  return msg;
}
