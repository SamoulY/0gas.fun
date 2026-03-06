function analyzeAnswer(answer = '') {
  const trimmed = String(answer).trim();
  const lower = trimmed.toLowerCase();

  const hasReasoningWords = /因为|所以|因此|然而|但是|尽管|although|because|therefore|however/.test(lower);
  const hasListPattern = /\d\.\s|首先|其次|最后|first|second|finally/.test(lower);
  const sentenceCount = trimmed.split(/[。！？.!?]/).filter(Boolean).length;
  const charLength = trimmed.length;

  return {
    charLength,
    sentenceCount,
    hasReasoningWords,
    hasListPattern,
  };
}

function computeHumanScore(answer, modelLooksHuman, metrics = {}) {
  const analysis = analyzeAnswer(answer);

  let score = 0.5;
  if (modelLooksHuman) score += 0.25;
  if (analysis.charLength <= 20) score += 0.15;
  if (analysis.charLength > 60) score -= 0.25;
  if (analysis.hasReasoningWords) score -= 0.15;
  if (analysis.hasListPattern) score -= 0.2;
  if (analysis.sentenceCount >= 3) score -= 0.1;

  const editCount = Number(metrics.editCount || 0);
  const inputLatencyMs = Number(metrics.inputLatencyMs || 0);
  if (editCount > 0 && editCount <= 20) score += 0.05;
  if (inputLatencyMs > 1500 && inputLatencyMs < 90000) score += 0.05;

  if (score < 0) score = 0;
  if (score > 1) score = 1;

  return {
    humanScore: Number(score.toFixed(3)),
    analysis,
  };
}

function buildFeedback(answer, modelLooksHuman, metrics = {}) {
  const { humanScore, analysis } = computeHumanScore(answer, modelLooksHuman, metrics);
  const accepted = modelLooksHuman && humanScore >= 0.45;

  let reasonCode = 'accepted';
  let message = '验证通过，可以进入广告与领奖流程。';

  if (!accepted) {
    if (analysis.charLength === 0) {
      reasonCode = 'empty_answer';
      message = '答案不能为空，请重新输入。';
    } else if (analysis.charLength > 80) {
      reasonCode = 'too_long';
      message = '答案过长，请尽量用简短自然的表达。';
    } else if (analysis.hasListPattern || analysis.hasReasoningWords) {
      reasonCode = 'over_reasoning';
      message = '检测到过度推理风格，请直接回答核心结论。';
    } else {
      reasonCode = 'not_human_like';
      message = '当前答案未通过人类特征校验，请重试。';
    }
  }

  return {
    accepted,
    humanScore,
    reasonCode,
    message,
    analysis,
  };
}

module.exports = {
  analyzeAnswer,
  computeHumanScore,
  buildFeedback,
};
