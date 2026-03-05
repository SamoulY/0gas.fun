const ALLOWED_AD_ACTIONS = new Set([
  'continue_playback',
  'show_click_hint',
  'ack_click',
  'enforce_wait',
  'complete_ad',
]);

function fallbackAdAction(state) {
  const remainingSeconds = Math.max(0, Math.ceil((state.requiredMs - state.elapsedMs) / 1000));

  if (remainingSeconds <= 0) {
    return {
      action: 'complete_ad',
      reason: 'Ad duration met, ready to complete',
    };
  }

  if (state.lastUserEvent === 'click') {
    return {
      action: 'ack_click',
      reason: 'Click tracked; continue watching to complete',
    };
  }

  if (remainingSeconds <= 8) {
    return {
      action: 'enforce_wait',
      reason: `Final ${remainingSeconds}s, please wait`,
    };
  }

  if (state.clickCount === 0 && state.elapsedMs > 5000) {
    return {
      action: 'show_click_hint',
      reason: 'You can click the ad CTA or wait for completion',
    };
  }

  return {
    action: 'continue_playback',
    reason: `${remainingSeconds}s remaining`,
  };
}

function parseLlmAction(text) {
  const trimmed = String(text || '').trim().toLowerCase();
  if (!trimmed) return null;

  if (ALLOWED_AD_ACTIONS.has(trimmed)) {
    return { action: trimmed, reason: 'from llm' };
  }

  const maybeJson = trimmed.startsWith('{') ? trimmed : null;
  if (!maybeJson) return null;
  try {
    const parsed = JSON.parse(maybeJson);
    const action = String(parsed.action || '').trim().toLowerCase();
    if (ALLOWED_AD_ACTIONS.has(action)) {
      return {
        action,
        reason: String(parsed.reason || 'from llm json'),
      };
    }
  } catch (err) {
    return null;
  }

  return null;
}

async function decideAdAction({ deepseekApiKey, axios, prompts, state }) {
  if (!deepseekApiKey || !axios) {
    return fallbackAdAction(state);
  }

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompts.adControlPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              elapsedMs: state.elapsedMs,
              requiredMs: state.requiredMs,
              clickCount: state.clickCount,
              lastUserEvent: state.lastUserEvent || null,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 60,
      },
      {
        headers: {
          Authorization: `Bearer ${deepseekApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const raw = response?.data?.choices?.[0]?.message?.content || '';
    const parsed = parseLlmAction(raw);
    if (parsed) return parsed;
    return fallbackAdAction(state);
  } catch (err) {
    return fallbackAdAction(state);
  }
}

module.exports = {
  ALLOWED_AD_ACTIONS,
  fallbackAdAction,
  decideAdAction,
};
