import { useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const FLOW = {
  STANDARD: 'standard',
  DATA_COLLECTION: 'data_collection',
};

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
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

function App() {
  const [account, setAccount] = useState(null);
  const [mode, setMode] = useState(null);
  const [sessionId, setSessionId] = useState('');

  const [question, setQuestion] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);

  const [selfLabel, setSelfLabel] = useState('');
  const [selfLabelSaved, setSelfLabelSaved] = useState(false);

  const [showStandardModal, setShowStandardModal] = useState(false);

  const [adModalOpen, setAdModalOpen] = useState(false);
  const [adTimer, setAdTimer] = useState(30);
  const [adSessionId, setAdSessionId] = useState('');
  const [llmAdMessage, setLlmAdMessage] = useState('LLM 正在控制广告播放...');

  const [claimResult, setClaimResult] = useState(null);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');

  const inputStartRef = useRef(0);
  const editCountRef = useRef(0);
  const adCountdownIntervalRef = useRef(null);
  const adLlmIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(adCountdownIntervalRef.current);
      clearInterval(adLlmIntervalRef.current);
    };
  }, []);

  const isBusy = Boolean(loadingText);

  const resetQuestionState = () => {
    setQuestion('');
    setQuestionId('');
    setAnswer('');
    setFeedback(null);
    setSelfLabel('');
    setSelfLabelSaved(false);
    setShowStandardModal(false);
  };

  const resetAll = () => {
    setMode(null);
    setSessionId('');
    resetQuestionState();
    setClaimResult(null);
    setAdModalOpen(false);
    setAdTimer(30);
    setAdSessionId('');
    setLlmAdMessage('LLM 正在控制广告播放...');
    setError('');
    setLoadingText('');
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      throw new Error('请安装 MetaMask');
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts?.[0];
    if (!address) {
      throw new Error('未获取到钱包地址');
    }
    setAccount(address);
    return address;
  };

  const startFlowMode = async (selectedMode) => {
    try {
      setError('');
      setClaimResult(null);
      resetQuestionState();
      setMode(selectedMode);

      setLoadingText('创建验证会话中...');
      const data = await postJson('/api/v2/session/start', {
        mode: selectedMode,
        userAddress: account,
        source: 'frontend_demo',
      });
      setSessionId(data.sessionId);

      if (selectedMode === FLOW.DATA_COLLECTION) {
        await generateQuestion(data.sessionId);
      }
    } catch (err) {
      setError(err.message);
      setMode(null);
      setSessionId('');
    } finally {
      setLoadingText('');
    }
  };

  const generateQuestion = async (targetSessionId = sessionId) => {
    try {
      if (!targetSessionId) {
        throw new Error('会话不存在，请重新选择流程');
      }
      setError('');
      setLoadingText('生成问题中...');
      const data = await postJson('/api/v2/challenge/generate', {
        sessionId: targetSessionId,
      });

      setQuestion(data.question);
      setQuestionId(data.questionId);
      setAnswer('');
      setFeedback(null);
      setSelfLabel('');
      setSelfLabelSaved(false);
      inputStartRef.current = Date.now();
      editCountRef.current = 0;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingText('');
    }
  };

  const submitAnswer = async () => {
    try {
      if (!answer.trim()) {
        throw new Error('请输入答案');
      }

      setError('');
      setLoadingText('校验答案中...');
      const data = await postJson('/api/v2/challenge/submit', {
        sessionId,
        questionId,
        answer: answer.trim(),
        metrics: {
          inputLatencyMs: Math.max(0, Date.now() - inputStartRef.current),
          editCount: editCountRef.current,
        },
      });

      setFeedback(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingText('');
    }
  };

  const submitSelfLabel = async (label) => {
    try {
      setError('');
      setLoadingText('提交人类自反馈中...');
      await postJson('/api/v2/self-label', {
        sessionId,
        selfLabel: label,
      });
      setSelfLabel(label);
      setSelfLabelSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingText('');
    }
  };

  const pollLlmAction = async (currentAdSessionId) => {
    try {
      const data = await postJson('/api/v2/ad/llm-action', {
        sessionId,
        adSessionId: currentAdSessionId,
      });
      const reason = data.reason ? `：${data.reason}` : '';
      setLlmAdMessage(`LLM 动作: ${data.action}${reason}`);
    } catch (err) {
      setLlmAdMessage('LLM 动作获取失败，按计时继续播放');
    }
  };

  const claimReward = async () => {
    let walletAddress = account;
    if (!walletAddress) {
      walletAddress = await connectWallet();
    }

    const data = await postJson('/api/v2/claim', {
      sessionId,
      userAddress: walletAddress,
    });
    setClaimResult(data);
  };

  const finishAdAndClaim = async (currentAdSessionId) => {
    try {
      setLoadingText('完成广告校验并领取奖励中...');
      await postJson('/api/v2/ad/complete', {
        sessionId,
        adSessionId: currentAdSessionId,
      });

      await claimReward();
      setAdModalOpen(false);
    } catch (err) {
      setError(err.message);
      setAdModalOpen(false);
    } finally {
      clearInterval(adCountdownIntervalRef.current);
      clearInterval(adLlmIntervalRef.current);
      setLoadingText('');
    }
  };

  const startAdFlow = async () => {
    try {
      setError('');
      setLoadingText('启动广告播放中...');
      const data = await postJson('/api/v2/ad/start', {
        sessionId,
        provider: 'frontend_mock_ad',
        adUnitId: mode === FLOW.STANDARD ? 'verify_standard_ad' : 'collect_data_ad',
      });

      setAdSessionId(data.adSessionId);
      setAdTimer(data.requiredSeconds || 30);
      setLlmAdMessage('LLM 已接管广告播放策略，你可以点击广告或等待完成。');
      setAdModalOpen(true);

      clearInterval(adCountdownIntervalRef.current);
      clearInterval(adLlmIntervalRef.current);

      adLlmIntervalRef.current = setInterval(() => {
        pollLlmAction(data.adSessionId);
      }, 4000);

      adCountdownIntervalRef.current = setInterval(() => {
        setAdTimer((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            clearInterval(adCountdownIntervalRef.current);
            clearInterval(adLlmIntervalRef.current);
            finishAdAndClaim(data.adSessionId);
            return 0;
          }

          if (next % 5 === 0) {
            postJson('/api/v2/ad/event', {
              sessionId,
              adSessionId: data.adSessionId,
              eventType: 'wait',
              meta: { remaining: next },
            }).catch(() => {});
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingText('');
    }
  };

  const reportAdClick = async () => {
    try {
      await postJson('/api/v2/ad/event', {
        sessionId,
        adSessionId,
        eventType: 'click',
        meta: { source: 'cta_button' },
      });
      setLlmAdMessage('点击已记录，继续等待广告完成。');
    } catch (err) {
      setError(err.message);
    }
  };

  const canStartAd =
    feedback?.accepted &&
    (mode === FLOW.STANDARD || (mode === FLOW.DATA_COLLECTION && selfLabelSaved));

  return (
    <div className="app">
      <h1>GasFree 验证系统</h1>
      <p className="subtitle">A: 普通验证 / 外部接入 · B: 人类数据收集</p>

      {error && <div className="error">{error}</div>}
      {isBusy && <div className="loading-banner">{loadingText}</div>}

      <div className="wallet-row">
        <span>钱包: {account || '未连接'}</span>
        <button onClick={connectWallet} disabled={isBusy}>
          {account ? '切换钱包' : '连接钱包'}
        </button>
      </div>

      {!mode && (
        <div className="mode-grid">
          <div className="mode-card">
            <h3>A. 普通验证 / 外部接入验证</h3>
            <p>长条验证入口，点击后弹出正方形问答弹窗，完成广告后领取奖励。</p>
            <button onClick={() => startFlowMode(FLOW.STANDARD)} disabled={isBusy}>
              进入 A 流程
            </button>
          </div>

          <div className="mode-card">
            <h3>B. 人类数据收集流程</h3>
            <p>直接问答 + 人类自反馈（是/否），完成广告后领奖并沉淀数据。</p>
            <button onClick={() => startFlowMode(FLOW.DATA_COLLECTION)} disabled={isBusy}>
              进入 B 流程
            </button>
          </div>
        </div>
      )}

      {mode === FLOW.STANDARD && (
        <div className="card">
          <h3>流程 A：普通验证</h3>
          <p>会话 ID: {sessionId || '-'}</p>
          <button
            className="verify-entry-btn"
            onClick={async () => {
              await generateQuestion();
              setShowStandardModal(true);
            }}
            disabled={isBusy || !sessionId}
          >
            点击验证
          </button>

          {feedback && (
            <div className={`feedback ${feedback.accepted ? 'ok' : 'fail'}`}>
              <div>反馈：{feedback.feedback}</div>
              <div>人类分：{feedback.humanScore}</div>
              <div>原因码：{feedback.reasonCode}</div>
            </div>
          )}

          {canStartAd && (
            <button onClick={startAdFlow} disabled={isBusy}>
              开始 30 秒广告并领奖
            </button>
          )}
        </div>
      )}

      {mode === FLOW.DATA_COLLECTION && (
        <div className="card">
          <h3>流程 B：人类数据收集</h3>
          <p>会话 ID: {sessionId || '-'}</p>

          {question ? (
            <>
              <div className="question-box">{question}</div>
              <input
                type="text"
                placeholder="请输入你的答案"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  editCountRef.current += 1;
                }}
              />
              <div className="button-row">
                <button onClick={submitAnswer} disabled={isBusy}>
                  提交答案
                </button>
                <button
                  className="secondary"
                  onClick={() => generateQuestion()}
                  disabled={isBusy}
                >
                  换一题
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => generateQuestion()} disabled={isBusy || !sessionId}>
              生成问题
            </button>
          )}

          {feedback && (
            <div className={`feedback ${feedback.accepted ? 'ok' : 'fail'}`}>
              <div>反馈：{feedback.feedback}</div>
              <div>人类分：{feedback.humanScore}</div>
              <div>原因码：{feedback.reasonCode}</div>
            </div>
          )}

          {feedback?.accepted && (
            <div className="self-label-box">
              <p>你认为自己是人类吗？</p>
              <div className="button-row">
                <button
                  onClick={() => submitSelfLabel('human')}
                  className={selfLabel === 'human' ? 'selected' : ''}
                  disabled={isBusy}
                >
                  是
                </button>
                <button
                  onClick={() => submitSelfLabel('not_human')}
                  className={selfLabel === 'not_human' ? 'selected' : ''}
                  disabled={isBusy}
                >
                  否
                </button>
              </div>
              {selfLabelSaved && <div className="hint-ok">自反馈已记录</div>}
            </div>
          )}

          {canStartAd && (
            <button onClick={startAdFlow} disabled={isBusy}>
              开始 30 秒广告并领奖
            </button>
          )}
        </div>
      )}

      {showStandardModal && (
        <div className="modal-overlay">
          <div className="modal-square">
            <h3>验证问题</h3>
            <div className="question-box">{question || '问题生成中...'}</div>
            <input
              type="text"
              placeholder="请输入你的答案"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                editCountRef.current += 1;
              }}
            />
            <div className="button-row">
              <button onClick={submitAnswer} disabled={isBusy || !question}>
                提交答案
              </button>
              <button
                className="secondary"
                onClick={() => generateQuestion()}
                disabled={isBusy}
              >
                换一题
              </button>
            </div>
            <button className="secondary" onClick={() => setShowStandardModal(false)}>
              关闭
            </button>
          </div>
        </div>
      )}

      {adModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>LLM 广告播放控制</h3>
            <p>剩余时间：{adTimer}s</p>
            <div className="ad-timer">{adTimer}s</div>
            <div className="llm-message">{llmAdMessage}</div>
            <div className="button-row">
              <button onClick={reportAdClick}>点击广告 CTA</button>
              <button className="secondary" disabled>
                等待自动完成
              </button>
            </div>
          </div>
        </div>
      )}

      {claimResult && (
        <div className="card success">
          <h3>领取成功</h3>
          <p>奖励：{claimResult.rewardAmount} DEV</p>
          <p>验证交易：</p>
          <div className="tx-hash">{claimResult.txHashVerify}</div>
          <p>广告交易：</p>
          <div className="tx-hash">{claimResult.txHashAd}</div>
          <p>奖励交易：</p>
          <div className="tx-hash">{claimResult.rewardTxHash}</div>
          <p>凭证 Token：</p>
          <div className="tx-hash">{claimResult.attestationToken}</div>
          <button onClick={resetAll}>重新开始</button>
        </div>
      )}
    </div>
  );
}

export default App;
