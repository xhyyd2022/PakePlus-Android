(function() {
    // 强制声明，确保即使注入多次也不会报错
    if (window.__K2_INJECTED__) return;
    window.__K2_INJECTED__ = true;

    // ---------------- [1. PakePlus 官方跳转逻辑] ----------------
    const hookPakeLinks = () => {
        const handle = (e) => {
            const a = e.target.closest('a');
            if (a && a.href && (a.target === '_blank' || a.href.startsWith('http'))) {
                e.preventDefault();
                location.href = a.href;
            }
        };
        document.addEventListener('click', handle, { capture: true });
        window.open = (url) => { location.href = url; };
    };

    // ---------------- [2. 移动端 UI 适配 CSS] ----------------
    const injectStyle = () => {
        if (document.getElementById('pp-k2-style')) return;
        const css = `
            @media screen and (max-width: 900px) {
                html, body { height: auto !important; overflow-y: auto !important; }
                #root, .app-container { height: auto !important; min-height: 100vh !important; display: block !important; overflow: visible !important; }
                header { height: auto !important; flex-direction: column !important; padding: 10px !important; gap: 8px !important; }
                .header-right { width: 100% !important; flex-wrap: wrap !important; justify-content: center !important; gap: 5px !important; }
                .header-divider, .refresh-control { display: none !important; }
                .dashboard-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
                .metric-card { height: 80px !important; }
                #card-cable.card-cable { grid-column: span 2 !important; height: auto !important; min-height: 70px !important; }
                #card-cable .metric-value { font-size: 1rem !important; white-space: normal !important; }
                .filter-dropdown-container { position: static !important; }
                .panel-header { position: relative !important; }
                .filter-menu { left: 10px !important; right: 10px !important; width: calc(100% - 20px) !important; max-height: 60vh !important; overflow-y: auto !important; top: 45px !important; z-index: 9999 !important; }
                .content-split { flex-direction: column !important; height: auto !important; }
                .log-panel { width: 100% !important; height: 500px !important; border-bottom: 1px solid var(--border-color) !important; margin-bottom: 10px !important; flex: none !important; }
                .toggle-panel { width: 100% !important; min-width: unset !important; height: 600px !important; flex: none !important; }
                #resizer { display: none !important; }
                #btn-ble-bridge, #btn-connect { flex: 1 1 42% !important; }
            }
        `;
        const styleTag = document.createElement("style");
        styleTag.id = 'pp-k2-style';
        styleTag.innerText = css;
        document.head ? document.head.appendChild(styleTag) : document.documentElement.appendChild(styleTag);
    };

    // ---------------- [3. 蓝牙 HID 核心类定义] ----------------
    const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
    const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

    class VirtualBLEDevice extends EventTarget {
        constructor() {
            super();
            this.productName = "WITRN K2 (Bluetooth)";
            this.opened = false;
            this.device = null;
            this.vendorId = 0x1814;
            this.productId = 0x5060;
        }
        async open() {
            if (!navigator.bluetooth) return alert("当前环境不支持蓝牙，请检查 App 权限设置");
            try {
                this.device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: [SERVICE_UUID] }, { namePrefix: "WITRN" }]
                });
                this.device.addEventListener('gattserverdisconnected', () => {
                    this.opened = false;
                    this.updateUI(false);
                    if (navigator.hid) navigator.hid.dispatchEvent(new Event("disconnect"));
                });
                const server = await this.device.gatt.connect();
                const service = await server.getPrimaryService(SERVICE_UUID);
                const char = await service.getCharacteristic(TX_CHAR_UUID);
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', (e) => {
                    if (!this.opened) return;
                    const fakeEvent = new Event("inputreport");
                    Object.defineProperty(fakeEvent, 'data', { value: e.target.value });
                    Object.defineProperty(fakeEvent, 'device', { value: this });
                    this.dispatchEvent(fakeEvent);
                });
                this.opened = true;
                this.updateUI(true);
            } catch (err) { this.updateUI(false); console.error(err); }
        }
        async close() { if (this.device) this.device.gatt.disconnect(); }
        updateUI(connected) {
            const btn = document.getElementById('btn-ble-bridge');
            if (btn) {
                btn.innerText = connected ? "断开蓝牙" : "蓝牙连接";
                btn.style.backgroundColor = connected ? "var(--danger-color)" : "var(--accent-color)";
            }
        }
        async sendReport() {}
    }

    // ---------------- [4. 核心执行逻辑] ----------------
    try {
        hookPakeLinks();
        let bleInst = new VirtualBLEDevice();

        // 劫持 WebHID
        if (navigator.hid) {
            const oldReq = navigator.hid.requestDevice.bind(navigator.hid);
            navigator.hid.requestDevice = async (o) => {
                if (window.__USE_BLE__) return [bleInst];
                return oldReq(o);
            };
        }

        // 强力循环注入
        const tryRun = () => {
            injectStyle();
            const originalBtn = document.getElementById('btn-connect');
            const container = document.querySelector('.header-right');

            if (originalBtn && container && !document.getElementById('btn-ble-bridge')) {
                const bleBtn = document.createElement('button');
                bleBtn.id = 'btn-ble-bridge';
                bleBtn.className = "primary-btn";
                bleBtn.innerText = '蓝牙连接';
                bleBtn.style.marginRight = "8px";
                bleBtn.onclick = (e) => {
                    e.preventDefault();
                    if (bleInst.opened) { bleInst.close(); } 
                    else {
                        window.__USE_BLE__ = true;
                        originalBtn.click();
                        setTimeout(() => { window.__USE_BLE__ = false; }, 500);
                    }
                };
                container.insertBefore(bleBtn, originalBtn);
            }
        };

        // 在 PakePlus 环境下，使用 setInterval 保证 React 渲染后依然能注入
        setInterval(tryRun, 1500);

    } catch (fatalError) {
        console.error("K2 Injector Fatal:", fatalError);
    }
})();