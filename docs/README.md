# Trip 项目文档

## 目录结构

```
docs/
├── api/                    # API相关文档
│   ├── api-debug.md       # API调试指南
│   └── post-api-500-error-debugging.md # Post接口500错误调试文档
├── architecture/           # 系统架构文档
│   └── figma-structure.md # Figma设计结构
├── deployment/             # 部署文档
│   ├── deployment.md       # 部署指南
│   ├── frontend-porting.md # 前端迁移指南
│   └── operations-readiness.md # 运维就绪指南
├── features/               # 功能特性文档
│   ├── 4.7-message-feature.md  # 4.7版消息功能
│   ├── friend-search-feature.md # 好友搜索功能
│   ├── post-detail-modal.md    # 帖子详情弹窗
│   └── ui-change-log-2026-03-23.md # UI变更日志
├── guides/                 # 开发指南
│   ├── config-debug-guide.md   # 配置调试指南
│   ├── dev-reflection.md       # 开发反思
│   ├── development-summary.md  # 开发总结
│   └── frontend-backend-handoff.md # 前后端交接指南
└── skills/                 # 技能/技巧文档
    └── (空)
```

## 使用说明

1. 每个目录代表一个文档主题类别
2. 文档使用Markdown格式编写
3. 文件命名使用连字符分隔，便于阅读
4. 保持文档与代码同步更新

## 维护原则

- 新功能开发完成后，及时更新相关功能文档
- 部署流程变更时，更新部署目录下的文档
- 架构重大调整时，更新架构目录下的文档