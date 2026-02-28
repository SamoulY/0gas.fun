(function (global) {
  const DEFAULT_API_URL = 'http://localhost:3000';

  class GasFreeSDK {
    constructor() {
      this.apiUrl = DEFAULT_API_URL;
      this.modal = null;
      this.currentParams = null;
      this._currentInterval = null;
    }

    init(options = {}) {
      this.apiUrl = options.apiUrl || DEFAULT_API_URL;
    }

    start(params) {
      if (!params.userAddress) {
        throw new Error('userAddress is required');
      }
      this.currentParams = params;
      this._fetchQuestion();
    }

    async _fetchQuestion() {
      const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
      try {
        const res = await fetch(`${this.apiUrl}/api/generate-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        this._showQuestionModal(sessionId, data.question);
      } catch (err) {
        this._handleError(err);
      }
    }

    _showQuestionModal(sessionId, question) {
      this._closeModal();
      const modal = this._createModal(`
        <h3>🤖 AI验证</h3>
        <p class="gasfree-question">${question}</p>
        <input type="text" id="gasfree-answer" placeholder="请输入你的答案" />
        <div class="gasfree-button-group">
          <button id="gasfree-change-btn">换一题</button>
          <button id="gasfree-submit-btn">开始验证并观看广告</button>
        </div>
      `);
      modal.querySelector('#gasfree-change-btn').addEventListener('click', () => {
        this._fetchQuestion();
      });
      modal.querySelector('#gasfree-submit-btn').addEventListener('click', () => {
        const answer = modal.querySelector('#gasfree-answer').value.trim();
        if (!answer) {
          alert('请输入答案');
          return;
        }
        this._startAdAndVerify(sessionId, question, answer);
      });
      this.modal = modal;
    }

    _startAdAndVerify(sessionId, question, answer) {
      this._closeModal();
      let adTimer = 30;
      const modal = this._createModal(`
        <h3>📺 观看广告</h3>
        <p>请等待 <span id="gasfree-timer">30</span> 秒，广告播放中...</p>
        <div class="gasfree-timer" id="gasfree-timer-display">30s</div>
        <p>后台验证正在进行，广告结束后将显示结果</p>
      `);
      this.modal = modal;

      const timerSpan = modal.querySelector('#gasfree-timer');
      const timerDisplay = modal.querySelector('#gasfree-timer-display');
      const interval = setInterval(() => {
        adTimer -= 1;
        timerSpan.textContent = adTimer;
        timerDisplay.textContent = adTimer + 's';
        if (adTimer <= 0) {
          clearInterval(interval);
          this._submitVerification(sessionId, question, answer);
        }
      }, 1000);

      this._currentInterval = interval;
    }

    async _submitVerification(sessionId, question, answer) {
      this._showLoadingModal();
      try {
        const res = await fetch(`${this.apiUrl}/api/verify-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            question,
            answer,
            userAddress: this.currentParams.userAddress,
            adWatched: true
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        this._showSuccessModal(data);
        if (this.currentParams.onSuccess) this.currentParams.onSuccess(data);
      } catch (err) {
        this._handleError(err);
      } finally {
        if (this._currentInterval) clearInterval(this._currentInterval);
      }
    }

    _showSuccessModal(result) {
      this._closeModal();
      const modal = this._createModal(`
        <h3>✅ 验证成功！</h3>
        <p>你已获得 <strong>${result.rewardAmount} DEV</strong> 奖励！</p>
        <p>奖励交易哈希：</p>
        <div class="gasfree-tx-hash">${result.rewardTxHash}</div>
        <p>AI验证交易哈希：</p>
        <div class="gasfree-tx-hash">${result.txHashVerify}</div>
        <p>广告记录交易哈希：</p>
        <div class="gasfree-tx-hash">${result.txHashAd}</div>
        <button id="gasfree-close-btn">关闭</button>
      `);
      modal.querySelector('#gasfree-close-btn').addEventListener('click', () => this._closeModal());
      this.modal = modal;
    }

    _showLoadingModal() {
      this._closeModal();
      this.modal = this._createModal(`
        <h3>⏳ 正在处理中...</h3>
        <p>请稍候，我们正在验证您的答案并发放奖励。</p>
        <div class="gasfree-spinner"></div>
      `);
    }

    _handleError(err) {
      this._closeModal();
      alert('错误: ' + err.message);
      if (this.currentParams && this.currentParams.onError) {
        this.currentParams.onError(err);
      }
    }

    _createModal(contentHtml) {
      this._closeModal();

      const overlay = document.createElement('div');
      overlay.className = 'gasfree-modal-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const modal = document.createElement('div');
      modal.className = 'gasfree-modal-content';
      modal.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 16px;
        max-width: 500px;
        width: 90%;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        color: #333;
        font-family: Arial, sans-serif;
      `;
      modal.innerHTML = contentHtml;

      this._injectDynamicStyles();

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      return modal;
    }

    _injectDynamicStyles() {
      if (document.getElementById('gasfree-styles')) return;
      const style = document.createElement('style');
      style.id = 'gasfree-styles';
      style.textContent = `
        .gasfree-question {
          font-size: 1.2rem;
          font-weight: bold;
          margin: 20px 0;
          color: #0d3c5e;
        }
        .gasfree-modal-content input {
          width: 80%;
          padding: 10px;
          margin: 15px 0;
          border: 1px solid #ccc;
          border-radius: 6px;
          font-size: 1rem;
        }
        .gasfree-modal-content button {
          padding: 10px 20px;
          font-size: 1rem;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          margin: 5px;
        }
        .gasfree-modal-content button:hover {
          background-color: #0056b3;
        }
        .gasfree-button-group {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-top: 10px;
        }
        .gasfree-timer {
          font-size: 3rem;
          font-weight: bold;
          color: #007bff;
          margin: 20px 0;
        }
        .gasfree-spinner {
          border: 4px solid rgba(0,0,0,0.1);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border-left-color: #007bff;
          animation: gasfree-spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes gasfree-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .gasfree-tx-hash {
          background-color: #f8f9fa;
          border: 2px solid #007bff;
          border-radius: 8px;
          padding: 10px;
          margin: 10px 0;
          font-family: monospace;
          word-break: break-all;
          color: #0066cc;
        }
      `;
      document.head.appendChild(style);
    }

    _closeModal() {
      if (this.modal) {
        const overlay = this.modal.parentElement;
        if (overlay) overlay.remove();
        this.modal = null;
      }
      if (this._currentInterval) {
        clearInterval(this._currentInterval);
        this._currentInterval = null;
      }
    }
  }

  const GasFree = new GasFreeSDK();

  // 自动从 script 标签 URL 解析 apiUrl
  (function autoInit() {
    let scriptTag;
    if (document.currentScript) {
      scriptTag = document.currentScript;
    } else {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src.includes('gasfree.js')) {
          scriptTag = scripts[i];
          break;
        }
      }
    }
    if (scriptTag && scriptTag.src) {
      try {
        const url = new URL(scriptTag.src);
        const params = new URLSearchParams(url.search);
        const apiUrl = params.get('apiUrl');
        if (apiUrl) {
          GasFree.init({ apiUrl: decodeURIComponent(apiUrl) });
          console.log('GasFree SDK 已自动初始化，API地址:', apiUrl);
        }
      } catch (e) {
        console.warn('GasFree SDK 自动初始化失败', e);
      }
    }
  })();

  global.GasFree = GasFree;

  if (typeof exports !== 'undefined' && typeof module !== 'undefined') {
    module.exports = GasFree;
  }
})(typeof window !== 'undefined' ? window : this);
