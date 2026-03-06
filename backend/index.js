const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
const cors = require('cors');

const config = require('./config');
const prompts = require('./prompts');
const { wallet, contract, isChainEnabled } = require('./contract');
const { SessionManager } = require('./sessionManager');
const { buildFeedback } = require('./humanVerifier');
const { decideAdAction } = require('./adController');
const { signPayload, verifyPayload } = require('./attestation');
const { ensureDir, appendJsonLine } = require('./dataCollector');

ensureDir(config.tmpDir);

/**
 * 生成对抗性问题
 */
async function generateAdversarialQuestion() {
  try {
    if (!config.deepseekApiKey) {
      const mockQuestions = [
        '如果水是液体，那冰是液体吗？',
        '如果所有鸟都会飞，而企鹅是鸟，但企鹅不会飞，那么企鹅是鸟吗？',
        '人需要呼吸氧气才能生存，那宇航员在太空怎么呼吸？',
        '水在100℃沸腾，那在高原上水沸腾的温度是多少？',
        '如果正方形有四条边，去掉一条边变成什么形状？',
        '猫是哺乳动物，那鲸鱼是鱼吗？',
        '如果太阳从东边升起，那在金星上太阳从哪边升起？',
        '2+2=4，那2×2等于多少？',
        '如果地球是球体，那为什么地面是平的？',
        '冰是固体，那干冰是什么？',
      ];
      return mockQuestions[Math.floor(Math.random() * mockQuestions.length)];
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompts.generateQuestionPrompt },
          { role: 'user', content: '请生成一个这样的问题。' },
        ],
        temperature: 1.2,
        max_tokens: 80,
      },
      {
        headers: {
          Authorization: `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let question = response.data.choices[0].message.content.trim();
    if (!question.endsWith('？') && !question.endsWith('?')) {
      question += '？';
    }
    return question;
  } catch (error) {
    console.error('DeepSeek 问题生成失败，使用默认问题:', error.message);
    return '如果水是液体，那冰是液体吗？';
  }
}

/**
 * 判断答案是否人类
 */
async function isAnswerHumanLike(question, answer) {
  try {
    if (!config.deepseekApiKey) {
      const lowerAns = String(answer || '').toLowerCase();
      if (answer.length > 50 && (lowerAns.includes('因为') || lowerAns.includes('所以') || lowerAns.includes('例如'))) return false;
      if (/因为|所以|因此|然而|但是|尽管|虽然|由于/.test(lowerAns)) return false;
      if (/\d\.\s|首先|其次|最后|第一|第二/.test(lowerAns)) return false;
      if (lowerAns.includes('不是') || lowerAns.includes('不对') || lowerAns.includes('不会')) return true;
      return answer.length <= 24;
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompts.verifyAnswerPrompt },
          { role: 'user', content: `问题：${question}\n答案：${answer}\n这个答案是 human 还是 ai？` },
        ],
        temperature: 0.2,
        max_tokens: 12,
      },
      {
        headers: {
          Authorization: `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const result = response.data.choices[0].message.content.trim().toLowerCase();
    return result === 'human';
  } catch (error) {
    console.error('DeepSeek 答案判断失败，使用默认规则:', error.message);
    return answer.length <= 20 && (answer.includes('不是') || answer.includes('不对') || answer.includes('不会'));
  }
}

function sanitizeSession(session) {
  return {
    id: session.id,
    mode: session.mode,
    source: session.source,
    userAddress: session.userAddress,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    challenge: session.challenge
      ? {
          questionId: session.challenge.questionId,
          question: session.challenge.question,
          createdAt: session.challenge.createdAt,
          answerSubmitted: session.challenge.answerSubmitted,
        }
      : null,
    verification: session.verification
      ? {
          submittedAt: session.verification.submittedAt,
          accepted: session.verification.accepted,
          humanScore: session.verification.humanScore,
          reasonCode: session.verification.reasonCode,
        }
      : null,
    selfLabel: session.selfLabel,
    ad: session.ad
      ? {
          adSessionId: session.ad.adSessionId,
          provider: session.ad.provider,
          adUnitId: session.ad.adUnitId,
          startedAt: session.ad.startedAt,
          requiredSeconds: session.ad.requiredSeconds,
          completedAt: session.ad.completedAt,
          eventCount: session.ad.events.length,
        }
      : null,
    claimed: session.claimed,
  };
}

async function settleOnChainAndReward({ userAddress, question, answer }) {
  if (!isChainEnabled || config.chainDryRun) {
    return {
      txHashVerify: 'dryrun_verify_tx',
      txHashAd: 'dryrun_ad_tx',
      rewardTxHash: 'dryrun_reward_tx',
      rewardAmount: config.rewardAmount,
      chainEnabled: false,
    };
  }

  const questionHash = ethers.keccak256(
    ethers.toUtf8Bytes(question + answer + userAddress + Date.now())
  );

  const txVerify = await contract.setUserVerified(userAddress, question, answer, questionHash);
  await txVerify.wait();

  const txAd = await contract.setUserAdWatched(userAddress);
  await txAd.wait();

  const rewardAmount = ethers.parseEther(config.rewardAmount);
  const rewardTx = await wallet.sendTransaction({
    to: userAddress,
    value: rewardAmount,
  });
  await rewardTx.wait();

  return {
    txHashVerify: txVerify.hash,
    txHashAd: txAd.hash,
    rewardTxHash: rewardTx.hash,
    rewardAmount: config.rewardAmount,
    chainEnabled: true,
  };
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const sessionManager = new SessionManager({
    ttlMs: config.sessionTtlMs,
    adRequiredSeconds: config.adRequiredSeconds,
  });

  const cleanupTimer = setInterval(() => {
    sessionManager.cleanupExpired();
  }, 60 * 1000);
  cleanupTimer.unref();

  // -------- V2 APIs --------
  app.post('/api/v2/session/start', (req, res) => {
    try {
      const { mode, userAddress, source } = req.body || {};
      const session = sessionManager.createSession({ mode, userAddress: userAddress || null, source: source || 'frontend' });
      res.json({
        sessionId: session.id,
        mode: session.mode,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/v2/session/:sessionId', (req, res) => {
    try {
      const session = sessionManager.ensureActiveSession(req.params.sessionId);
      res.json({ session: sanitizeSession(session) });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.post('/api/v2/challenge/generate', async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

      sessionManager.ensureActiveSession(sessionId);
      const question = await generateAdversarialQuestion();
      const challenge = sessionManager.createChallenge(sessionId, question);

      res.json({
        sessionId,
        questionId: challenge.questionId,
        question,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/challenge/submit', async (req, res) => {
    try {
      const { sessionId, questionId, answer, metrics } = req.body || {};
      if (!sessionId || !answer) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const session = sessionManager.ensureActiveSession(sessionId);
      if (!session.challenge) {
        return res.status(400).json({ error: 'Challenge not generated' });
      }

      const modelLooksHuman = await isAnswerHumanLike(session.challenge.question, answer);
      const feedback = buildFeedback(answer, modelLooksHuman, metrics || {});

      const verification = sessionManager.submitAnswer(sessionId, {
        questionId,
        answer,
        accepted: feedback.accepted,
        humanScore: feedback.humanScore,
        reasonCode: feedback.reasonCode,
        feedback: feedback.message,
        metrics: metrics || {},
        modelDecision: modelLooksHuman ? 'human' : 'ai',
      });

      res.json({
        accepted: verification.accepted,
        humanScore: verification.humanScore,
        reasonCode: verification.reasonCode,
        feedback: verification.feedback,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/self-label', (req, res) => {
    try {
      const { sessionId, selfLabel } = req.body || {};
      if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
      }

      const session = sessionManager.ensureActiveSession(sessionId);
      if (session.mode !== 'data_collection') {
        return res.status(400).json({ error: 'Self label only required in data_collection mode' });
      }

      const label = sessionManager.setSelfLabel(sessionId, selfLabel);
      res.json({
        success: true,
        selfLabel: label.value,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/ad/start', (req, res) => {
    try {
      const { sessionId, provider, adUnitId } = req.body || {};
      if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

      const ad = sessionManager.startAd(sessionId, { provider, adUnitId });
      sessionManager.recordAdEvent(sessionId, {
        adSessionId: ad.adSessionId,
        eventType: 'impression',
        meta: { source: 'ad_start' },
      });

      res.json({
        adSessionId: ad.adSessionId,
        requiredSeconds: ad.requiredSeconds,
        provider: ad.provider,
        allowUserClick: true,
        allowUserWait: true,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/ad/event', (req, res) => {
    try {
      const { sessionId, adSessionId, eventType, meta } = req.body || {};
      if (!sessionId || !adSessionId || !eventType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const event = sessionManager.recordAdEvent(sessionId, { adSessionId, eventType, meta });
      res.json({ success: true, event });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/ad/llm-action', async (req, res) => {
    try {
      const { sessionId, adSessionId, context } = req.body || {};
      if (!sessionId || !adSessionId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const session = sessionManager.ensureActiveSession(sessionId);
      if (!session.ad || session.ad.adSessionId !== adSessionId) {
        return res.status(400).json({ error: 'Ad session mismatch' });
      }

      const elapsedMs = Date.now() - session.ad.startedAt;
      const requiredMs = session.ad.requiredSeconds * 1000;
      const clickCount = session.ad.events.filter((it) => it.eventType === 'click').length;
      const lastUserEvent = session.ad.events.length
        ? session.ad.events[session.ad.events.length - 1].eventType
        : null;

      const action = await decideAdAction({
        deepseekApiKey: config.deepseekApiKey,
        axios,
        prompts,
        state: {
          elapsedMs,
          requiredMs,
          clickCount,
          lastUserEvent,
          context: context || {},
        },
      });

      sessionManager.recordLlmAdAction(sessionId, {
        adSessionId,
        action: action.action,
        reason: action.reason,
      });

      res.json(action);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/ad/complete', (req, res) => {
    try {
      const { sessionId, adSessionId } = req.body || {};
      if (!sessionId || !adSessionId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = sessionManager.completeAd(sessionId, { adSessionId });
      sessionManager.recordAdEvent(sessionId, {
        adSessionId,
        eventType: 'wait',
        meta: { completed: true },
      });

      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/v2/claim', async (req, res) => {
    try {
      const { sessionId, userAddress } = req.body || {};
      if (!sessionId || !userAddress) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!ethers.isAddress(userAddress)) {
        return res.status(400).json({ error: 'Invalid user address' });
      }

      const session = sessionManager.ensureActiveSession(sessionId);
      const claimCheck = sessionManager.canClaim(sessionId);
      if (!claimCheck.ok) {
        return res.status(400).json({ error: `Cannot claim: ${claimCheck.reason}` });
      }

      const chainResult = await settleOnChainAndReward({
        userAddress,
        question: session.challenge.question,
        answer: session.verification.answer,
      });

      const attestationToken = signPayload(
        {
          sessionId,
          mode: session.mode,
          userAddress,
          humanScore: session.verification.humanScore,
          selfLabel: session.selfLabel ? session.selfLabel.value : null,
        },
        config.attestationSecret,
        config.attestationTtlMs
      );

      sessionManager.markClaimed(sessionId, attestationToken);

      if (session.mode === 'data_collection') {
        appendJsonLine(config.humanDataFile, {
          sessionId,
          timestamp: Date.now(),
          mode: session.mode,
          userAddress,
          question: session.challenge.question,
          answer: session.verification.answer,
          humanScore: session.verification.humanScore,
          selfLabel: session.selfLabel ? session.selfLabel.value : null,
          modelDecision: session.verification.modelDecision,
          metrics: session.verification.metrics,
          adEvents: session.ad.events,
          adLlmActions: session.ad.llmActions,
        });
      }

      res.json({
        success: true,
        rewardAmount: chainResult.rewardAmount,
        txHashVerify: chainResult.txHashVerify,
        txHashAd: chainResult.txHashAd,
        rewardTxHash: chainResult.rewardTxHash,
        attestationToken,
        chainEnabled: chainResult.chainEnabled,
      });
    } catch (error) {
      console.error('Claim error:', error);
      res.status(500).json({ error: 'Claim failed: ' + error.message });
    }
  });

  app.post('/api/v2/relay-transaction', async (req, res) => {
    try {
      const { attestationToken, userAddress, targetContract, data, value } = req.body || {};
      if (!attestationToken || !userAddress || !targetContract || !data) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const verified = verifyPayload(attestationToken, config.attestationSecret);
      if (!verified.valid) {
        return res.status(400).json({ error: `Invalid attestation: ${verified.reason}` });
      }

      if (verified.payload.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
        return res.status(400).json({ error: 'Attestation user mismatch' });
      }

      if (!isChainEnabled || config.chainDryRun) {
        return res.json({ success: true, txHash: 'dryrun_relay_tx', chainEnabled: false });
      }

      const canExecute = await contract.canUserExecute(userAddress);
      if (!canExecute) {
        return res.status(400).json({ error: 'User not verified or ad expired' });
      }

      const tx = await contract.executeForUser(
        userAddress,
        targetContract,
        data,
        ethers.parseEther(value || '0')
      );
      const receipt = await tx.wait();
      res.json({ success: true, txHash: receipt.hash, chainEnabled: true });
    } catch (error) {
      console.error('Relay transaction error:', error);
      res.status(500).json({ error: 'Relay failed: ' + error.message });
    }
  });

  // -------- Legacy APIs (compat) --------
  app.post('/api/generate-question', async (req, res) => {
    try {
      const sessionId = req.body?.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

      let session = sessionManager.getSession(sessionId);
      if (!session) {
        session = sessionManager.createSession({
          mode: 'standard',
          source: 'legacy',
          requestedId: sessionId,
          userAddress: req.body?.userAddress || null,
        });
      } else {
        sessionManager.ensureActiveSession(sessionId);
      }

      const question = await generateAdversarialQuestion();
      const challenge = sessionManager.createChallenge(sessionId, question);
      res.json({ question, questionId: challenge.questionId, sessionId });
    } catch (error) {
      console.error('Generate question error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/verify-answer', async (req, res) => {
    try {
      const { sessionId, question, answer, userAddress, adWatched } = req.body || {};

      if (!sessionId || !question || !answer || !userAddress) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      let session = sessionManager.getSession(sessionId);
      if (!session) {
        session = sessionManager.createSession({
          mode: 'standard',
          source: 'legacy',
          requestedId: sessionId,
          userAddress,
        });
      }

      sessionManager.ensureActiveSession(sessionId);

      if (!session.challenge || session.challenge.question !== question) {
        sessionManager.createChallenge(sessionId, question);
      }

      const modelLooksHuman = await isAnswerHumanLike(question, answer);
      const feedback = buildFeedback(answer, modelLooksHuman, {});

      sessionManager.submitAnswer(sessionId, {
        questionId: session.challenge.questionId,
        answer,
        accepted: feedback.accepted,
        humanScore: feedback.humanScore,
        reasonCode: feedback.reasonCode,
        feedback: feedback.message,
        modelDecision: modelLooksHuman ? 'human' : 'ai',
      });

      if (!feedback.accepted) {
        return res.status(400).json({ error: 'Answer looks like AI generated' });
      }

      if (!adWatched) {
        return res.status(400).json({ error: 'Ad not watched' });
      }

      const ad = sessionManager.startAd(sessionId, { provider: 'legacy' });
      ad.startedAt = Date.now() - ad.requiredSeconds * 1000;
      sessionManager.completeAd(sessionId, { adSessionId: ad.adSessionId });

      const chainResult = await settleOnChainAndReward({ userAddress, question, answer });

      res.json({
        success: true,
        txHashVerify: chainResult.txHashVerify,
        txHashAd: chainResult.txHashAd,
        rewardTxHash: chainResult.rewardTxHash,
        rewardAmount: chainResult.rewardAmount,
      });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ error: 'Verification failed: ' + error.message });
    }
  });

  app.post('/api/relay-transaction', async (req, res) => {
    try {
      const { userAddress, targetContract, data, value } = req.body || {};
      if (!userAddress || !targetContract || !data) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!isChainEnabled || config.chainDryRun) {
        return res.json({ success: true, txHash: 'dryrun_relay_tx', chainEnabled: false });
      }

      const canExecute = await contract.canUserExecute(userAddress);
      if (!canExecute) {
        return res.status(400).json({ error: 'User not verified or ad expired' });
      }

      const tx = await contract.executeForUser(
        userAddress,
        targetContract,
        data,
        ethers.parseEther(value || '0')
      );
      const receipt = await tx.wait();
      res.json({ success: true, txHash: receipt.hash, chainEnabled: true });
    } catch (error) {
      console.error('Relay transaction error:', error);
      res.status(500).json({ error: 'Relay failed: ' + error.message });
    }
  });

  app.get('/health', (req, res) => {
    res.send('OK');
  });

  return { app, sessionManager };
}

function startServer() {
  const { app } = createApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`GasFree backend running on http://0.0.0.0:${config.port}`);
    if (isChainEnabled && !config.chainDryRun) {
      console.log(`Relayer address: ${wallet.address}`);
      console.log(`Contract address: ${config.contractAddress}`);
    } else {
      console.log('Chain mode: dry-run / disabled');
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
  generateAdversarialQuestion,
  isAnswerHumanLike,
};
