// index.js
const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const config = require('./config');
const prompts = require('./prompts');
const { wallet, contract } = require('./contract');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const questionStore = new Map(); // session存储

/**
 * 生成对抗性问题（使用外部提示词）
 */
async function generateAdversarialQuestion() {
  try {
    if (!config.deepseekApiKey) {
      // 预设攻击性问题库
      const mockQuestions = [
        "如果水是液体，那冰是液体吗？",
        "如果所有鸟都会飞，而企鹅是鸟，但企鹅不会飞，那么企鹅是鸟吗？",
        "人需要呼吸氧气才能生存，那宇航员在太空怎么呼吸？",
        "水在100℃沸腾，那在高原上水沸腾的温度是多少？",
        "如果正方形有四条边，去掉一条边变成什么形状？",
        "猫是哺乳动物，那鲸鱼是鱼吗？",
        "如果太阳从东边升起，那在金星上太阳从哪边升起？",
        "2+2=4，那2×2等于多少？",
        "如果地球是球体，那为什么地面是平的？",
        "冰是固体，那干冰是什么？"
      ];
      return mockQuestions[Math.floor(Math.random() * mockQuestions.length)];
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompts.generateQuestionPrompt },
          { role: 'user', content: '请生成一个这样的问题。' }
        ],
        temperature: 1.3,
        max_tokens: 50
      },
      {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    let question = response.data.choices[0].message.content.trim();
    if (!question.endsWith('？') && !question.endsWith('?')) {
      question += '？';
    }
    return question;
  } catch (error) {
    console.error('DeepSeek 问题生成失败，使用默认问题:', error.message);
    return "如果水是液体，那冰是液体吗？";
  }
}

/**
 * 判断答案是否人类（使用外部提示词）
 */
async function isAnswerHumanLike(question, answer) {
  try {
    if (!config.deepseekApiKey) {
      // 增强型启发式规则（无API Key时使用）
      const lowerAns = answer.toLowerCase();
      if (answer.length > 50 && (lowerAns.includes('因为') || lowerAns.includes('所以') || lowerAns.includes('例如'))) return false;
      if (/因为|所以|因此|然而|但是|尽管|虽然|由于/.test(lowerAns)) return false;
      if (/\d\.\s|首先|其次|最后|第一|第二/.test(lowerAns)) return false;
      if (lowerAns.includes('不是') || lowerAns.includes('不对') || lowerAns.includes('不会')) return true;
      return Math.random() > 0.5;
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompts.verifyAnswerPrompt },
          { role: 'user', content: `问题：${question}\n答案：${answer}\n这个答案是 human 还是 ai？` }
        ],
        temperature: 0.2,
        max_tokens: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const result = response.data.choices[0].message.content.trim().toLowerCase();
    return result === 'human';
  } catch (error) {
    console.error('DeepSeek 答案判断失败，使用默认规则:', error.message);
    return answer.length <= 20 && (answer.includes('不是') || answer.includes('不对') || answer.includes('不会'));
  }
}

// API路由（与之前相同，但使用config.rewardAmount）
app.post('/api/generate-question', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    const question = await generateAdversarialQuestion();
    questionStore.set(sessionId, { question, createdAt: Date.now() });
    setTimeout(() => questionStore.delete(sessionId), 5 * 60 * 1000);
    res.json({ question });
  } catch (error) {
    console.error('Generate question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/verify-answer', async (req, res) => {
  try {
    const { sessionId, question, answer, userAddress, adWatched } = req.body;

    if (!sessionId || !question || !answer || !userAddress) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stored = questionStore.get(sessionId);
    if (!stored || stored.question !== question) {
      return res.status(400).json({ error: 'Invalid session or question mismatch' });
    }
    if (Date.now() - stored.createdAt > 5 * 60 * 1000) {
      questionStore.delete(sessionId);
      return res.status(400).json({ error: 'Question expired' });
    }
    if (!adWatched) {
      return res.status(400).json({ error: 'Ad not watched' });
    }

    const isHuman = await isAnswerHumanLike(question, answer);
    if (!isHuman) {
      return res.status(400).json({ error: 'Answer looks like AI generated' });
    }

    const questionHash = ethers.keccak256(
      ethers.toUtf8Bytes(question + answer + userAddress + Date.now())
    );

    console.log('Sending setUserVerified...');
    const txVerify = await contract.setUserVerified(userAddress, question, answer, questionHash);
    await txVerify.wait();
    console.log('setUserVerified confirmed:', txVerify.hash);

    console.log('Sending setUserAdWatched...');
    const txAd = await contract.setUserAdWatched(userAddress);
    await txAd.wait();
    console.log('setUserAdWatched confirmed:', txAd.hash);

    console.log('Sending reward...');
    const rewardAmount = ethers.parseEther(config.rewardAmount);
    const rewardTx = await wallet.sendTransaction({
      to: userAddress,
      value: rewardAmount
    });
    await rewardTx.wait();
    console.log('Reward confirmed:', rewardTx.hash);

    questionStore.delete(sessionId);

    res.json({
      success: true,
      txHashVerify: txVerify.hash,
      txHashAd: txAd.hash,
      rewardTxHash: rewardTx.hash,
      rewardAmount: config.rewardAmount
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

app.post('/api/relay-transaction', async (req, res) => {
  try {
    const { userAddress, targetContract, data, value } = req.body;
    if (!userAddress || !targetContract || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
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
    res.json({ success: true, txHash: receipt.hash });
  } catch (error) {
    console.error('Relay transaction error:', error);
    res.status(500).json({ error: 'Relay failed: ' + error.message });
  }
});

app.get('/health', (req, res) => {
  res.send('OK');
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`GasFree backend running on http://0.0.0.0:${config.port}`);
  console.log(`Relayer address: ${wallet.address}`);
  console.log(`Contract address: ${config.contractAddress}`);
});
