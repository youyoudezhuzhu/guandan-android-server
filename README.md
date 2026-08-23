# 掼蛋局域网服务器 APK（Guandan Android Server）

把 [Guandan-Webgame](https://github.com/Hanazar-Games/Guandan-Webgame)（四人掼蛋局域网 Web 游戏）打包成安卓应用服务端。

打开 App 即自动启动内置的 Node.js 服务器（通过 [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) 嵌入，零 npm 依赖），同一局域网的任何设备用浏览器/扫码访问 `http://<手机IP>:4173` 即可加入联机对战，2–4 名真人 + AI 补位。

## 游戏特性

- 🔄 **逆时针出牌**：遵循掼蛋传统轮转方向（自己 → 右手边 → 对家 → 左手边）
- 🎁 **进贡 / 还贡 / 抗贡**：末游向头游进贡除红桃级牌外最大的一张（含大小王），头游还一张 10 及以下；末游抓到两张大王可抗贡并先出
- 🃏 **完整牌型**：单张、对子、三张、三带二、顺子、三连对、钢板（aaabbb）、同花顺、炸弹、四王炸；非炸弹牌型最多 6 张，仅同数字炸弹可出更多
- 🏆 **标准结算**：头游升级（搭档二游升 3 / 三游升 2 / 末游升 1）、双下连升、接风、逢人配（红桃级牌可当任意牌）
- 🎖️ **技能模式（单机/联机可选）**：无中生有（抽2张）/ 顺手牵羊（偷1张）/ 过河拆桥（弃1张）/ 乐不思蜀（跳过回合）/ 五谷登丰（全员+1张），开局每人发 2 张技能卡，AI 也会用技能
- 📱 **手机横屏自适应**：按视口比例自动分配布局（顶部对手区 / 出牌区 / 按钮 / 手牌），任意分辨率不重叠；左上角悬浮「菜单」收纳全部操作，版本号缩为左下角小字
- ⛶ **一键全屏**：手机浏览器 / 内嵌 WebView 隐藏地址栏
- 🌐 **IP 全量显示**：WiFi / 热点 / 流量等多网卡地址自动识别全部展示

## 技术能力

- 📱 打开即服务：App 内自动复制项目文件并启动 Node 服务器（前台服务保活）
- 🔗 启动页显示局域网地址 + 二维码，其他设备扫码直达
- 🎮 "本机打开游戏"按钮：内嵌 WebView，开服务器的手机自己也能玩
- 🚀 内置 Node.js v18.20.4（nodejs-mobile 预编译运行时，仅 arm64-v8a）
- 🔒 服务器只做房间管理与消息中继（HTTP + SSE），规则引擎在浏览器端，负载极低

## 使用

1. 安装 APK（Release 页面下载）
2. 打开 App，等待状态变为"服务器运行中"
3. 同一 WiFi 下其他设备：
   - 用相机扫 App 内二维码，或浏览器打开 `http://192.168.x.x:4173`
4. 一人创建房间，其余输 6 位房间码加入

## 构建

GitHub Actions 自动构建（push / workflow_dispatch）：

```bash
# 本地无需 Android SDK，全部在 Actions 完成
git push origin main
```

Workflow 做的事情：
1. 安装 JDK 17 + Android SDK + NDK 26 + CMake
2. 从 nodejs-mobile release 拉取 `libnode.so`（arm64-v8a）与头文件
3. `assembleDebug` + `assembleRelease`
4. 自签 release APK 并上传 artifact

## 目录结构

```
app/src/main/
├── assets/nodejs-project/   # Guandan-Webgame 源文件（运行时复制到 filesDir）
├── cpp/native-lib.cpp       # JNI 桥：node::Start + stdout/stderr 重定向到 logcat
├── java/.../NodeService.java    # 前台服务：复制 assets + 启动 node
├── java/.../MainActivity.java   # 启动页：状态/地址/二维码
└── java/.../GameActivity.java   # 内嵌 WebView 玩游戏
app/libnode/                 # libnode.so + 头文件（CI 下载，不入库）
```

## 升级游戏版本

替换 `app/src/main/assets/nodejs-project/` 下的游戏文件（lan-server.cjs / index.html / script.js / app.js / styles.css）后 push 即可，App 检测到 APK 更新会自动重新复制。

> ⚠️ **定制点提醒**（升级上游游戏文件后需重新补上）：
> 1. `index.html` 尾部的**全屏按钮**（悬浮 ⛶，Fullscreen API，移动端显示、桌面端隐藏）
> 2. `styles.css` 末尾的**横屏手机适配**媒体查询（`orientation: landscape and pointer: coarse`，修复 CSS 宽度 <761px 手机横屏时误走竖屏布局、桌面溢出的问题）

## 已知限制

- 仅 arm64-v8a（现代手机都是这个架构）
- 进贡还贡、正式升级计分、互联网匹配为游戏原项目未实现功能
- MIT License（游戏原项目 Hanazar-Games/Guandan-Webgame）
