'use client';

import { useState } from 'react';
import { BottomBar } from '@/components/layout/BottomBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export default function ComponentsPage() {
  const [open, setOpen] = useState(false);

  return (
    <main>
      <section className="container page grid">
        <div className="card">
          <h2 className="page-title">组件展示页</h2>
          <p className="page-desc">用于快速验收按钮、输入框和弹窗状态。</p>
        </div>

        <div className="card grid">
          <strong>Buttons</strong>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>

        <div className="card grid">
          <strong>Inputs</strong>
          <Input label="正常输入" placeholder="请输入内容" />
          <Input label="错误输入" placeholder="请输入内容" error="这是错误提示" />
        </div>

        <div className="card grid">
          <strong>Modal</strong>
          <div>
            <Button onClick={() => setOpen(true)}>打开弹窗</Button>
          </div>
        </div>

        <Modal
          open={open}
          title="示例弹窗"
          onClose={() => setOpen(false)}
          footer={
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={() => setOpen(false)}>确认</Button>
            </div>
          }
        >
          <p className="page-desc" style={{ margin: 0 }}>
            该弹窗支持自定义底部操作区域和关闭行为。
          </p>
        </Modal>
      </section>
      <BottomBar />
    </main>
  );
}
