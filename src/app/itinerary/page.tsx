'use client';

import { useMemo, useState } from 'react';
import { BottomBar } from '@/components/layout/BottomBar';
import { ItineraryCard } from '@/modules/itinerary/components/ItineraryCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/PageState';
import { DayTabs } from '@/modules/itinerary/components/DayTabs';
import { Timeline } from '@/modules/itinerary/components/Timeline';

const dayData = {
  Day1: [
    { time: '09:00', title: '抵达酒店', desc: '办理入住并整理行李' },
    { time: '11:00', title: '老城步行', desc: '按推荐线路打卡街区' },
  ],
  Day2: [
    { time: '10:00', title: '博物馆', desc: '提前预约，建议早入场' },
    { time: '15:00', title: '河岸骑行', desc: '傍晚光线更好' },
  ],
  Day3: [{ time: '08:30', title: '返程', desc: '预留出发前早餐时间' }],
};

type DayKey = keyof typeof dayData;

type ItineraryState = 'default' | 'edit' | 'empty';

function getPageTitle(state: ItineraryState): string {
  if (state === 'edit') {
    return 'Itinerary_Edit';
  }

  if (state === 'empty') {
    return 'Itinerary_Empty';
  }

  return 'Itinerary_Default';
}

export default function ItineraryPage() {
  const [activeDay, setActiveDay] = useState<DayKey>('Day1');
  const [state, setState] = useState<ItineraryState>('default');
  const items = useMemo(() => dayData[activeDay], [activeDay]);

  return (
    <main>
      <section className="container page grid">
        <div className="card grid">
          <h2 className="page-title">{getPageTitle(state)}</h2>
          <p className="page-desc">行程页支持 Default / Edit / Empty 状态切换。</p>
          <div className="row">
            <Button onClick={() => setState('default')}>Default</Button>
            <Button variant="secondary" onClick={() => setState('edit')}>Edit</Button>
            <Button variant="ghost" onClick={() => setState('empty')}>Empty</Button>
          </div>
        </div>

        {state === 'empty' ? (
          <EmptyState title="当前没有行程" desc="点击创建行程开始规划旅途。" action={<Button>新建行程</Button>} />
        ) : (
          <>
            <DayTabs
              days={Object.keys(dayData)}
              activeDay={activeDay}
              onChange={(day) => setActiveDay(day as DayKey)}
            />
            <ItineraryCard
              day={activeDay}
              title="城市文化探索"
              note={state === 'edit' ? '编辑模式：可拖拽排序（示例文案）' : '节奏偏轻松，可按天气调整。'}
            />
            <Timeline items={items} />
          </>
        )}
      </section>
      <BottomBar />
    </main>
  );
}
