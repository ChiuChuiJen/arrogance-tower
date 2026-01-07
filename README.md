版本：v0.0.11-test

# 傲慢之塔 Web（GitHub Pages）

這是一個可直接部署到 GitHub Pages 的網頁式遊戲 MVP（Vanilla JS、無需打包）。

## 功能（目前）
- 建立角色（localStorage 存檔）
- 1–10 層完整怪物池（一般10 / 菁英4 / Mini3 / Boss2）
- 重生倒數（一般2分鐘、菁英10分鐘、Boss30分鐘；Mini Boss 暫同 30 分鐘）
- 百納袋胸章：未配戴者無法獲得掉落（Canon）
- 掉落：金幣、食物/藥水、下一層令牌
- 通天碑：消耗令牌解鎖下一層

## 上線（GitHub Pages）
1. 建立 repo，將此資料夾內容 push 到 repo 根目錄
2. Settings → Pages → Deploy from a branch → main / root
3. 取得網址即可遊玩

生成時間：2026-01-07 00:18:43


## 介面
- 手機/電腦自適應（Responsive）
- Header 顯示版本號

## 版本號
- 目前從測試版 v0.0.1-test 開始
- 每次修改可執行：`python bump_version.py` 自動 +1（patch）
- 也可用提供的 git pre-commit hook 範例做到每次 commit 自動加版號
