# Test Workspace

本目录是本机专用的独立测试工程，不参与主项目 git 版本控制。

## 说明

- 当前已将原主项目里的 `test-css` 测试页迁移到这里。
- 该工程与主站路由解耦，适合做本地布局验证、随机数据实验和临时测试。

## Passport Visa

- 前台页面入口：`/passport-visa`
- 后台编辑入口：`/passport-visa-admin`
- 地图页当前已恢复独立 `bootstrap` 数据加载、颜色渲染、悬停国旗卡片、点击详情抽屉、场景切换与缩放交互。

### 详情抽屉现状

- 抽屉顶部保留一行功能图标入口，当前包含：
  - 官方签证网站
  - 中国驻当地使馆网站
  - 签证费
  - 停留时长
- 详情抽屉底部已移除“官方签证网站 / 中国驻当地使馆”两块文字卡片，仅保留图标入口。
- 抽屉内容区当前采用固定容器 + 内部定位布局，以避免删除卡片后发生相对布局错位。

### 图标显示规则

- 官方签证网站：当 `officialVisaUrl` 有值时显示。
- 中国驻当地使馆网站：当 `embassyUrl` 有值时显示。
- 签证费图标：
  - 仅当 `visaFee` 为“符号 + 数字”格式时显示，例如 `€90`、`$25`、`¥240`
  - 纯数字不显示图标
  - 其他非标准格式不显示图标，例如 `需咨询使领馆`、`300 BWP（...）`
- 停留时长图标：
  - 仅当 `stayDuration` 命中 `数字+天` 开头，且可按首个 `，` 或 `,` 分段时显示
  - 例如 `15天，普通签90天`：图标内显示 `15`，悬停提示显示 `普通签90天`
  - 不符合该格式时不显示图标

### 当前相关文件

- 页面：[app/passport-visa/page.tsx](/Users/apple/Desktop/codex/trip/test/app/passport-visa/page.tsx)
- 样式：[app/passport-visa/page.module.css](/Users/apple/Desktop/codex/trip/test/app/passport-visa/page.module.css)
- 签证官网图标：[lib/PassportVisaOfficialSiteMark.tsx](/Users/apple/Desktop/codex/trip/test/lib/PassportVisaOfficialSiteMark.tsx)
- 使馆图标：[lib/PassportVisaEmbassySiteMark.tsx](/Users/apple/Desktop/codex/trip/test/lib/PassportVisaEmbassySiteMark.tsx)
- 签证费图标：[lib/PassportVisaFeeMark.tsx](/Users/apple/Desktop/codex/trip/test/lib/PassportVisaFeeMark.tsx)
- 停留时长图标：[lib/PassportVisaStayDurationMark.tsx](/Users/apple/Desktop/codex/trip/test/lib/PassportVisaStayDurationMark.tsx)
- 图标解析规则：[lib/passportVisaFeeDisplay.ts](/Users/apple/Desktop/codex/trip/test/lib/passportVisaFeeDisplay.ts)
