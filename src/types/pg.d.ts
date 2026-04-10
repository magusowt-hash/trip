// 为了在未安装 `@types/pg` 时也能通过 Next 构建的 TS 类型检查。
// 你后续可以选择移除该文件并用 `@types/pg` 完整接管类型。
declare module 'pg' {
  export class Pool {
    constructor(config: any);
  }
}

