# 掼蛋局域网服务器 APK（Guandan Android Server）

把 [Guandan-Webgame](https://github.com/Hanazar-Games/Guandan-Webgame)（四人掼蛋局域网 Web 游戏）打包成安卓应用服务端。

打开 App 即自动启动内置的 Node.js 服务器（通过 [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) 嵌入，零 npm 依赖），同一局域网的任何设备用浏览器/扫码访问 `http://<手机IP>:4173` 即可加入联机对战，2–4 名真人 + AI 补位。

## 功能

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

## 已知限制

- 仅 arm64-v8a（现代手机都是这个架构）
- 进贡还贡、正式升级计分、互联网匹配为游戏原项目未实现功能
- MIT License（游戏原项目 Hanazar-Games/Guandan-Webgame）
