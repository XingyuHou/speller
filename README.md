# Speller

[下载离线游戏 ZIP](https://github.com/XingyuHou/speller/releases/latest/download/Speller-offline.zip) · [下载源码 ZIP](https://github.com/XingyuHou/speller/archive/refs/heads/main.zip)

**只想玩？** 下载离线游戏 ZIP，解压后双击 `Speller.html`，用电脑浏览器打开即可。不用联网、安装 Node.js 或启动服务器。转发 ZIP 即可分享游戏；收到文件的人不需要 GitHub 账号。

Speller 是一款文字跑酷网页游戏。白色笔画是可以踩的地形；踩到浅蓝色单词后，可以把它的字母重新排列，施法改变前方的路。

## 操作

建议用电脑浏览器搭配键盘和鼠标。`A` / `D` 左右移动，`W` 跳跃（按住跳得更高），`S` 收集附近的浅黄色字母；方向键也可用。用鼠标拖动字母，或依次点两个字母交换位置，按空格施法。`R` 回到检查点，`Esc` 暂停。

## 下载与运行

在 GitHub 仓库页面选择 **Code → Download ZIP**，解压后进入含有 `package.json` 的目录。也可以使用 **Code** 菜单中的地址克隆仓库。

使用 Node.js 22.12+ 或 24 LTS 和 npm：

```sh
npm ci
npm run dev
```

打开终端打印的本地地址。`npm test` 运行 Vitest 测试；`npm run build` 检查 TypeScript 并生成 `dist/`；`npm run preview` 可在本机试玩该构建版本。

运行 `npm run build:offline` 可重新生成独立文件 `offline/Speller.html`。这个文件才是适合双击或转发的版本；不要直接双击源码或 `dist/` 里的 `index.html`。

## 项目入口

- [关卡数据](src/level/level1.ts) · [可调参数](src/config.ts) · [测试](tests/)
- [完整设计规格](docs/DEMO_SPEC.md) · [作者文案清单](docs/AUTHOR_LINES.md)
