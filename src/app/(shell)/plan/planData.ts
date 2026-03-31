/**
 * 日期展示形态：单日 / 区间 / 模糊到月（仅标题上级为日期行）
 */
export type PlanDate =
  | { kind: 'single'; day: number }
  | {
      kind: 'range';
      start: { month: number; day: number };
      end: { month: number; day: number };
    }
  | { kind: 'month-fuzzy' };

export type ExistingPlanItem = {
  year: number;
  /** 归档月份（分组）；单日、整月与本字段一致；跨月区间可挂在起始月或结束月 */
  month: number;
  title: string;
  date: PlanDate;
};

function md(m: number, d: number) {
  return `${m}月${d}日`;
}

/** 第一行：仅日期文案（单日、区间、整月） */
export function formatPlanDateLine(p: ExistingPlanItem): string {
  const bucket = p.month;
  if (p.date.kind === 'single') {
    return md(bucket, p.date.day);
  }
  if (p.date.kind === 'range') {
    const a = p.date.start;
    const b = p.date.end;
    return `${md(a.month, a.day)}—${md(b.month, b.day)}`;
  }
  return '整月';
}

/** 同一月份内排序：按事件起点升序（最早在上；模糊整月靠后） */
function sortOrdinal(p: ExistingPlanItem): number {
  const bucket = p.month;
  if (p.date.kind === 'single') {
    return bucket * 100 + p.date.day;
  }
  if (p.date.kind === 'range') {
    const s = p.date.start;
    return s.month * 100 + s.day;
  }
  return bucket * 100 - 2;
}

export type GroupedYear = {
  year: number;
  months: {
    month: number;
    items: ExistingPlanItem[];
  }[];
};

/** 按年 ↑、月 ↑ 分组；无计划的月份不会出现 */
export function groupPlansByYearMonth(plans: ExistingPlanItem[]): GroupedYear[] {
  const years = [...new Set(plans.map((x) => x.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const inYear = plans.filter((p) => p.year === year);
    const months = [...new Set(inYear.map((p) => p.month))].sort((a, b) => a - b);
    return {
      year,
      months: months.map((month) => {
        const inMonth = inYear.filter((p) => p.month === month);
        const sorted = [...inMonth].sort((a, b) => sortOrdinal(a) - sortOrdinal(b));
        return { month, items: sorted };
      }),
    };
  });
}

/**
 * Demo：法定节假日与区间示例；仅用于 UI
 */
export const DEMO_EXISTING_PLANS: ExistingPlanItem[] = [
  { year: 2026, month: 1, title: '元旦：京津短途', date: { kind: 'single', day: 1 } },
  { year: 2026, month: 1, title: '元旦小长假：市内博物馆', date: { kind: 'range', start: { month: 1, day: 1 }, end: { month: 1, day: 3 } } },
  { year: 2026, month: 1, title: '春节前：采买与行李', date: { kind: 'single', day: 26 } },
  { year: 2026, month: 2, title: '春节黄金周 · 回乡团圆', date: { kind: 'month-fuzzy' } },
  { year: 2026, month: 2, title: '春节尾段：返程错峰', date: { kind: 'single', day: 17 } },
  { year: 2026, month: 4, title: '清明踏青：近郊一日', date: { kind: 'single', day: 4 } },
  { year: 2026, month: 4, title: '清明调休连休', date: { kind: 'range', start: { month: 4, day: 4 }, end: { month: 4, day: 6 } } },
  { year: 2026, month: 4, title: '清明后补休短途', date: { kind: 'single', day: 7 } },
  { year: 2026, month: 5, title: '劳动节：青岛海岸线', date: { kind: 'single', day: 1 } },
  { year: 2026, month: 5, title: '劳动节黄金周（示意）', date: { kind: 'range', start: { month: 5, day: 1 }, end: { month: 5, day: 5 } } },
  { year: 2026, month: 5, title: '劳动节调休：市内展', date: { kind: 'single', day: 2 } },
  { year: 2026, month: 6, title: '端午节前后 · 水乡慢行', date: { kind: 'month-fuzzy' } },
  { year: 2026, month: 6, title: '端午当日：龙舟赛', date: { kind: 'single', day: 19 } },
  { year: 2026, month: 9, title: '中秋跨日连休', date: { kind: 'range', start: { month: 9, day: 30 }, end: { month: 10, day: 2 } } },
  { year: 2026, month: 9, title: '中秋前：家庭采购', date: { kind: 'single', day: 24 } },
  { year: 2026, month: 10, title: '国庆节：西北环线（起）', date: { kind: 'single', day: 1 } },
  { year: 2026, month: 10, title: '国庆长假（示意）', date: { kind: 'range', start: { month: 10, day: 1 }, end: { month: 10, day: 7 } } },
  { year: 2026, month: 10, title: '国庆节：途中休整', date: { kind: 'single', day: 3 } },
  { year: 2026, month: 10, title: '国庆节调休收尾', date: { kind: 'single', day: 8 } },
  { year: 2026, month: 10, title: '国庆末段：本地休整', date: { kind: 'single', day: 7 } },
  { year: 2026, month: 11, title: '秋假：周末红叶', date: { kind: 'range', start: { month: 11, day: 7 }, end: { month: 11, day: 9 } } },
  { year: 2026, month: 12, title: '岁末短途', date: { kind: 'single', day: 31 } },
];
