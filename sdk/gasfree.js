(function (global) {
  const DEFAULT_API_URL = 'http://localhost:3000';
  const FLOW = {
    STANDARD: 'standard',
    DATA_COLLECTION: 'data_collection',
  };

  class GasFreeSDK {
    constructor() {
      this.apiUrl = DEFAULT_API_URL;
      this.modal = null;
      this.currentParams = null;
      this.currentSessionId = null;
      this.currentQuestionId = null;
      this.currentQuestion = '';
      this.currentMode = FLOW.STANDARD;
      this.currentAdSessionId = null;
      this._currentInterval = null;
      this._llmInterval = null;
      this._inputStartAt = 0;
      this._editCount = 0;
    }

    init(options = {}) {
      this.apiUrl = options.apiUrl || DEFAULT_API_URL;
    }

    async start(params) {
      if (!params || !params.userAddress) {
        throw new Error('userAddress is required');
      }

      this.currentParams = params;
      this.currentMode = params.mode === FLOW.DATA_COLLECTION ? FLOW.DATA_COLLECTION : FLOW.STANDARD;

      try {
        const started = await this._post('/api/v2/session/start', {
          mode: this.currentMode,
          userAddress: params.userAddress,
          source: 'sdk',
        });
        this.currentSessionId = started.sessionId;

        if (this.currentMode === FLOW.STANDARD) {
          this._showEntryButtonModal();
        } else {
          await this._openQuestionModal();
        }
      } catch (err) {
        this._handleError(err);
      }
    }

    async _openQuestionModal() {
      const data = await this._post('/api/v2/challenge/generate', {
        sessionId: this.currentSessionId,
      });

      this.currentQuestion = data.question;
      this.currentQuestionId = data.questionId;
      this._inputStartAt = Date.now();
      this._editCount = 0;

      this._showQuestionModal();
    }

    _showEntryButtonModal() {
      this._closeModal();
      const modal = this._createModal(`
        <h3>普通验证入口</h3>
        <p>点击长条按钮开始验证</p>
        <button id="gasfree-entry-btn" class="gasfree-entry-btn">点击验证</button>
      `);

      modal.querySelector('#gasfree-entry-btn').addEventListener('click', async () => {
        try {
          await this._openQuestionModal();
        } catch (err) {
          this._handleError(err);
        }
      });

      this.modal = modal;
    }

    _showQuestionModal() {
      this._closeModal();
      const includeSelfLabelHint = this.currentMode === FLOW.DATA_COLLECTION
        ? '<p class="gasfree-hint">数据收集模式：答题通过后需选择“是否为人类”</p>'
        : '';

      const modal = this._createModal(`
        <h3>🤖 AI验证</h3>
        <p class="gasfree-question">${this.currentQuestion}</p>
        ${includeSelfLabelHint}
        <input type="text" id="gasfree-answer" placeholder="请输入你的答案" />
        <div class="gasfree-button-group">
          <button id="gasfree-change-btn" class="secondary">换一题</button>
          <button id="gasfree-submit-btn">提交答案</button>
        </div>
        <div id="gasfree-feedback" class="gasfree-feedback"></div>
      `);

      const answerInput = modal.querySelector('#gasfree-answer');
      answerInput.addEventListener('input', () => {
        this._editCount += 1;
      });

      modal.querySelector('#gasfree-change-btn').addEventListener('click', async () => {
        try {
          await this._openQuestionModal();
        } catch (err) {
          this._handleError(err);
        }
      });

      modal.querySelector('#gasfree-submit-btn').addEventListener('click', async () => {
        const answer = answerInput.value.trim();
        if (!answer) {
          alert('请输入答案');
          return;
        }

        try {
          const verification = await this._post('/api/v2/challenge/submit', {
            sessionId: this.currentSessionId,
            questionId: this.currentQuestionId,
            answer,
            metrics: {
              inputLatencyMs: Math.max(0, Date.now() - this._inputStartAt),
              editCount: this._editCount,
            },
          });

          this._showFeedback(modal, verification);
          if (!verification.accepted) return;

          if (this.currentMode === FLOW.DATA_COLLECTION) {
            this._showSelfLabelActions(modal);
          } else {
            this._showAdStartButton(modal);
          }
        } catch (err) {
          this._handleError(err);
        }
      });

      this.modal = modal;
    }

    _showFeedback(modal, verification) {
      const feedbackEl = modal.querySelector('#gasfree-feedback');
      feedbackEl.innerHTML = `
        <div class="${verification.accepted ? 'ok' : 'fail'}">
          <div>反馈：${verification.feedback}</div>
          <div>人类分：${verification.humanScore}</div>
          <div>原因码：${verification.reasonCode}</div>
        </div>
      `;
    }

    _showSelfLabelActions(modal) {
      if (modal.querySelector('#gasfree-self-label')) return;

      const wrap = document.createElement('div');
      wrap.id = 'gasfree-self-label';
      wrap.className = 'gasfree-self-label';
      wrap.innerHTML = `
        <p>你认为自己是人类吗？</p>
        <div class="gasfree-button-group">
          <button id="gasfree-self-yes">是</button>
          <button id="gasfree-self-no" class="secondary">否</button>
        </div>
        <div id="gasfree-self-status" class="gasfree-self-status"></div>
      `;
      modal.appendChild(wrap);

      const submitSelf = async (value) => {
        const result = await this._post('/api/v2/self-label', {
          sessionId: this.currentSessionId,
          selfLabel: value,
        });
        modal.querySelector('#gasfree-self-status').textContent = `已记录: ${result.selfLabel}`;
        this._showAdStartButton(modal);
      };

      modal.querySelector('#gasfree-self-yes').addEventListener('click', async () => {
        try {
          await submitSelf('human');
        } catch (err) {
          this._handleError(err);
        }
      });
      modal.querySelector('#gasfree-self-no').addEventListener('click', async () => {
        try {
          await submitSelf('not_human');
        } catch (err) {
          this._handleError(err);
        }
      });
    }

    _showAdStartButton(modal) {
      if (modal.querySelector('#gasfree-start-ad')) return;

      const button = document.createElement('button');
      button.id = 'gasfree-start-ad';
      button.textContent = '开始30秒广告并领奖';
      button.addEventListener('click', async () => {
        try {
          await this._startAdFlow();
        } catch (err) {
          this._handleError(err);
        }
      });
      modal.appendChild(button);
    }

    async _startAdFlow() {
      this._closeModal();

      const ad = await this._post('/api/v2/ad/start', {
        sessionId: this.currentSessionId,
        provider: 'sdk_mock_ad',
        adUnitId: this.currentMode === FLOW.STANDARD ? 'sdk_standard' : 'sdk_data_collection',
      });

      this.currentAdSessionId = ad.adSessionId;
      let adTimer = Number(ad.requiredSeconds || 30);

      const modal = this._createModal(`
        <h3>📺 广告播放中</h3>
        <p>LLM 已获得广告操作权限（白名单动作）</p>
        <p>请等待 <span id="gasfree-timer">${adTimer}</span> 秒</p>
        <div class="gasfree-timer" id="gasfree-timer-display">${adTimer}s</div>
        <div id="gasfree-llm-msg" class="gasfree-llm-msg">LLM 正在控制广告流程...</div>
        <div class="gasfree-button-group">
          <button id="gasfree-ad-click">点击广告 CTA</button>
          <button class="secondary" disabled>等待完成</button>
        </div>
      `);

      const clickBtn = modal.querySelector('#gasfree-ad-click');
      clickBtn.addEventListener('click', async () => {
        try {
          await this._post('/api/v2/ad/event', {
            sessionId: this.currentSessionId,
            adSessionId: this.currentAdSessionId,
            eventType: 'click',
            meta: { source: 'sdk_cta' },
          });
          modal.querySelector('#gasfree-llm-msg').textContent = '点击已记录，继续播放...';
        } catch (err) {
          this._handleError(err);
        }
      });

      this.modal = modal;
      const timerSpan = modal.querySelector('#gasfree-timer');
      const timerDisplay = modal.querySelector('#gasfree-timer-display');

      const pollAction = async () => {
        try {
          const action = await this._post('/api/v2/ad/llm-action', {
            sessionId: this.currentSessionId,
            adSessionId: this.currentAdSessionId,
          });
          modal.querySelector('#gasfree-llm-msg').textContent = `LLM: ${action.action}${action.reason ? ` (${action.reason})` : ''}`;
        } catch (err) {
          modal.querySelector('#gasfree-llm-msg').textContent = 'LLM动作获取失败，保持计时播放';
        }
      };

      this._llmInterval = setInterval(pollAction, 4000);
      pollAction();

      this._currentInterval = setInterval(async () => {
        adTimer -= 1;
        timerSpan.textContent = adTimer;
        timerDisplay.textContent = `${adTimer}s`;

        if (adTimer > 0 && adTimer % 5 === 0) {
          this._post('/api/v2/ad/event', {
            sessionId: this.currentSessionId,
            adSessionId: this.currentAdSessionId,
            eventType: 'wait',
            meta: { remaining: adTimer },
          }).catch(() => {});
        }

        if (adTimer <= 0) {
          clearInterval(this._currentInterval);
          clearInterval(this._llmInterval);
          this._currentInterval = null;
          this._llmInterval = null;
          await this._completeAdAndClaim();
        }
      }, 1000);
    }

    async _completeAdAndClaim() {
      this._showLoadingModal();
      try {
        await this._post('/api/v2/ad/complete', {
          sessionId: this.currentSessionId,
          adSessionId: this.currentAdSessionId,
        });

        const result = await this._post('/api/v2/claim', {
          sessionId: this.currentSessionId,
          userAddress: this.currentParams.userAddress,
        });

        this._showSuccessModal(result);
        if (this.currentParams.onSuccess) this.currentParams.onSuccess(result);
      } catch (err) {
        this._handleError(err);
      }
    }

    async _post(path, payload) {
      const res = await fetch(`${this.apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed: ${res.status}`);
      }
      return data;
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
        <p>Attestation：</p>
        <div class="gasfree-tx-hash">${result.attestationToken || ''}</div>
        <button id="gasfree-close-btn">关闭</button>
      `);
      modal.querySelector('#gasfree-close-btn').addEventListener('click', () => this._closeModal());
      this.modal = modal;
    }

    _showLoadingModal() {
      this._closeModal();
      this.modal = this._createModal(`
        <h3>⏳ 正在处理中...</h3>
        <p>请稍候，我们正在校验广告并发放奖励。</p>
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
        padding: 24px;
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
        .gasfree-entry-btn {
          width: 100%;
          height: 50px;
          font-size: 1.1rem;
          font-weight: bold;
        }
        .gasfree-question {
          font-size: 1.1rem;
          font-weight: bold;
          margin: 16px 0;
          color: #0d3c5e;
        }
        .gasfree-hint {
          color: #516387;
          margin: 8px 0;
        }
        .gasfree-modal-content input {
          width: 90%;
          padding: 10px;
          margin: 10px 0;
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
        .gasfree-modal-content button.secondary {
          background-color: #6c757d;
        }
        .gasfree-modal-content button:hover {
          opacity: 0.9;
        }
        .gasfree-button-group {
          display: flex;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .gasfree-feedback {
          margin-top: 12px;
          text-align: left;
        }
        .gasfree-feedback .ok {
          background: #eaf7ec;
          border-left: 4px solid #2e7d32;
          padding: 8px 10px;
          border-radius: 6px;
        }
        .gasfree-feedback .fail {
          background: #fdeeee;
          border-left: 4px solid #c62828;
          padding: 8px 10px;
          border-radius: 6px;
        }
        .gasfree-self-label {
          margin-top: 10px;
          border: 1px dashed #a1b5da;
          border-radius: 8px;
          padding: 8px;
        }
        .gasfree-self-status {
          margin-top: 6px;
          color: #2e7d32;
          font-weight: bold;
        }
        .gasfree-llm-msg {
          margin-top: 8px;
          padding: 8px;
          border-radius: 6px;
          background: #eef4ff;
          border: 1px solid #cbd8f4;
        }
        .gasfree-timer {
          font-size: 2.8rem;
          font-weight: bold;
          color: #007bff;
          margin: 16px 0;
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
      if (this._llmInterval) {
        clearInterval(this._llmInterval);
        this._llmInterval = null;
      }
    }
  }

  const GasFree = new GasFreeSDK();

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
