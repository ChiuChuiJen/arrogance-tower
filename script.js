// 取得 DOM 元素
const logWindow = document.getElementById('log-window');
const floorDisplay = document.getElementById('floor-level');
const energyDisplay = document.getElementById('energy-val');

// 遊戲狀態
let floor = 1;
let energy = 100;

// 輸出日誌功能
function addLog(text, type = 'normal') {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    
    // 取得當前時間
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    
    div.innerText = `[${timeStr}] ${text}`;
    logWindow.appendChild(div);
    
    // 自動捲動到底部
    logWindow.scrollTop = logWindow.scrollHeight;
}

// 指令執行
function executeCommand(cmd) {
    // 檢查能量
    if (energy <= 0 && cmd !== 'rest' && cmd !== 'reset') {
        addLog('⚡ 能量不足！請進行休整。', 'warning');
        return;
    }

    switch(cmd) {
        case 'explore':
            energy -= 10;
            updateStats();
            addLog('正在掃描前方區域...', 'normal');
            
            // 模擬隨機事件
            setTimeout(() => {
                const roll = Math.random();
                if (roll > 0.7) {
                    addLog('⚠️ 遭遇敵對單位！戰鬥模組啟動！', 'warning');
                    floor++; // 戰鬥勝利前進一層
                    addLog(`>> 威脅排除。晉升至第 ${floor} 層。`, 'system');
                } else if (roll > 0.4) {
                    addLog('發現舊時代的物資箱 (+5 Energy)', 'system');
                    energy = Math.min(100, energy + 5);
                } else {
                    addLog('區域安全。無異常反應。', 'normal');
                }
                updateStats();
            }, 600);
            break;

        case 'rest':
            addLog('系統休眠模式... 能量回復中。', 'normal');
            energy = 100;
            updateStats();
            break;

        case 'status':
            addLog(`目前位於第 ${floor} 層。機體完整度 100%。`, 'system');
            break;

        case 'reset':
            if(confirm('警告：確定要重置系統嗎？所有進度將丟失。')) {
                floor = 1;
                energy = 100;
                logWindow.innerHTML = '';
                addLog('>> 系統重置完成。', 'warning');
                updateStats();
            }
            break;
            
        default:
            addLog('未知指令。', 'system');
    }
}

// 更新介面數值
function updateStats() {
    floorDisplay.innerText = floor.toString().padStart(2, '0') + 'F';
    energyDisplay.innerText = energy + '%';
    
    // 簡單的能量條顏色變化
    if(energy < 30) {
        energyDisplay.style.color = '#ff3333';
    } else {
        energyDisplay.style.color = '#FFD700';
    }
}

// 初始訊息
window.onload = () => {
    setTimeout(() => addLog('連線建立。等待指令...', 'system'), 500);
};