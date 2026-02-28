import { useState, useRef } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function App() {
  const [account, setAccount] = useState(null);
  const [sessionId] = useState(() => 'session_' + Math.random().toString(36).substr(2, 9));
  const [step, setStep] = useState('connect'); // connect, question, loading, done
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdModal, setShowAdModal] = useState(false);
  const [adTimer, setAdTimer] = useState(30);

  const verificationPromiseRef = useRef(null);
  const verificationCompletedRef = useRef(false);
  const verificationResultRef = useRef(null);
  const verificationErrorRef = useRef(null);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('请安装 MetaMask');
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      setAccount(accounts[0]);
      setStep('question');
    } catch (err) {
      console.error(err);
      setError('连接钱包失败');
    }
  };

  const generateQuestion = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/api/generate-question`, {
        sessionId
      });
      setQuestion(res.data.question);
    } catch (err) {
      setError('生成问题失败：' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const startVerification = () => {
    if (!answer.trim()) {
      setError('请输入答案');
      return;
    }
    setError('');
    setShowAdModal(true);
    setAdTimer(30);

    verificationCompletedRef.current = false;
    verificationResultRef.current = null;
    verificationErrorRef.current = null;

    const promise = axios.post(`${API_BASE_URL}/api/verify-answer`, {
      sessionId,
      question,
      answer,
      userAddress: account,
      adWatched: true
    });

    verificationPromiseRef.current = promise;

    promise
      .then(res => {
        verificationCompletedRef.current = true;
        verificationResultRef.current = res.data;
        if (!showAdModal) {
          setVerificationResult(res.data);
          setStep('done');
        }
      })
      .catch(err => {
        verificationCompletedRef.current = true;
        verificationErrorRef.current = err.response?.data?.error || err.message;
        if (!showAdModal) {
          setError('验证失败：' + verificationErrorRef.current);
          setStep('question');
        }
      });

    const interval = setInterval(() => {
      setAdTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowAdModal(false);

          if (verificationCompletedRef.current) {
            if (verificationResultRef.current) {
              setVerificationResult(verificationResultRef.current);
              setStep('done');
            } else {
              setError('验证失败：' + verificationErrorRef.current);
              setStep('question');
            }
          } else {
            setStep('loading');
            verificationPromiseRef.current
              .then(res => {
                setVerificationResult(res.data);
                setStep('done');
              })
              .catch(err => {
                setError('验证失败：' + (err.response?.data?.error || err.message));
                setStep('question');
              });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const reset = () => {
    setStep('question');
    setQuestion('');
    setAnswer('');
    setVerificationResult(null);
    setError('');
  };

  return (
    <div className="app">
      <h1>GasFree - AI 验证 + 广告即 Gas</h1>
      <p className="subtitle">回答问题并观看广告，即可获得 0.001 DEV 奖励！</p>

      {error && <div className="error">{error}</div>}

      {step === 'connect' && (
        <div className="card">
          <p>欢迎使用 GasFree！</p>
          <p>连接钱包开始体验</p>
          <button onClick={connectWallet}>连接钱包</button>
        </div>
      )}

      {step === 'question' && (
        <div className="card">
          <p><strong>当前账户：</strong>{account}</p>
          {!question ? (
            <button onClick={generateQuestion} disabled={loading}>
              {loading ? '生成中...' : '开始验证'}
            </button>
          ) : (
            <>
              <h3>🤖 AI 验证问题</h3>
              <p className="question">{question}</p>
              <input
                type="text"
                placeholder="请输入你的答案"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <div className="button-group">
                {/* 换一题按钮在左，提交在右 */}
                <button onClick={generateQuestion} className="secondary" disabled={loading}>
                  换一题
                </button>
                <button onClick={startVerification} disabled={loading}>
                  开始验证并观看广告
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'loading' && (
        <div className="card">
          <h3>⏳ 正在处理中...</h3>
          <p>请稍候，我们正在验证您的答案并发放奖励。</p>
          <div className="spinner"></div>
        </div>
      )}

      {step === 'done' && verificationResult && (
        <div className="card success">
          <h3>✅ 验证成功！</h3>
          <p>你已获得 <strong>{verificationResult.rewardAmount} DEV</strong> 奖励！</p>
          
          <p>奖励交易哈希：</p>
          <div className="tx-hash">{verificationResult.rewardTxHash}</div>
          
          <p>AI 验证交易哈希：</p>
          <div className="tx-hash">{verificationResult.txHashVerify}</div>
          
          <p>广告记录交易哈希：</p>
          <div className="tx-hash">{verificationResult.txHashAd}</div>
          
          <p>你可以在 Moonbase Alpha 区块浏览器查看交易。</p>
          <button onClick={reset}>再次挑战</button>
        </div>
      )}

      {/* 广告弹窗 */}
      {showAdModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>📺 观看广告</h3>
            <p>请等待 {adTimer} 秒，广告播放中...</p>
            <div className="ad-timer">{adTimer}s</div>
            <p>后台验证正在进行，广告结束后将显示结果</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
