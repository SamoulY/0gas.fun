const crypto = require('crypto');

const FLOW_MODES = new Set(['standard', 'data_collection']);
const SELF_LABELS = new Set(['human', 'not_human']);
const AD_EVENTS = new Set(['impression', 'click', 'wait', 'close_attempt', 'skip_attempt']);

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeMode(mode) {
  if (!mode) return 'standard';
  const normalized = String(mode).trim().toLowerCase();
  return FLOW_MODES.has(normalized) ? normalized : 'standard';
}

function normalizeSelfLabel(value) {
  if (typeof value === 'boolean') return value ? 'human' : 'not_human';
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'human' || normalized === 'true') return 'human';
  if (normalized === 'no' || normalized === 'not_human' || normalized === 'false') return 'not_human';
  return null;
}

class SessionManager {
  constructor(options = {}) {
    this.ttlMs = Number(options.ttlMs || 5 * 60 * 1000);
    this.adRequiredSeconds = Number(options.adRequiredSeconds || 30);
    this.sessions = new Map();
  }

  createSession({ mode, userAddress = null, source = 'unknown', requestedId } = {}) {
    const now = Date.now();
    const id = requestedId || randomId('sess');

    if (this.sessions.has(id)) {
      const existing = this.sessions.get(id);
      if (existing.expiresAt <= now) {
        this.sessions.delete(id);
      } else {
        return existing;
      }
    }

    const session = {
      id,
      mode: normalizeMode(mode),
      source,
      userAddress,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      challenge: null,
      verification: null,
      selfLabel: null,
      ad: null,
      claimed: false,
      attestationToken: null,
      meta: {
        attempts: 0,
      },
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  ensureActiveSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      throw new Error('Session expired');
    }
    return session;
  }

  createChallenge(sessionId, question) {
    const session = this.ensureActiveSession(sessionId);
    const challenge = {
      questionId: randomId('q'),
      question,
      createdAt: Date.now(),
      answerSubmitted: false,
    };
    session.challenge = challenge;
    session.verification = null;
    session.selfLabel = null;
    session.ad = null;
    session.claimed = false;
    session.attestationToken = null;
    session.meta.attempts += 1;
    return challenge;
  }

  submitAnswer(sessionId, payload) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.challenge) {
      throw new Error('Challenge not generated');
    }

    const questionId = payload.questionId || session.challenge.questionId;
    if (questionId !== session.challenge.questionId) {
      throw new Error('Question mismatch');
    }

    session.challenge.answerSubmitted = true;
    session.verification = {
      submittedAt: Date.now(),
      answer: payload.answer,
      accepted: Boolean(payload.accepted),
      humanScore: Number(payload.humanScore || 0),
      reasonCode: payload.reasonCode || null,
      feedback: payload.feedback || null,
      metrics: payload.metrics || {},
      modelDecision: payload.modelDecision || null,
    };

    if (!session.verification.accepted) {
      session.ad = null;
      session.claimed = false;
      session.attestationToken = null;
    }

    return session.verification;
  }

  setSelfLabel(sessionId, selfLabel) {
    const session = this.ensureActiveSession(sessionId);
    const normalized = normalizeSelfLabel(selfLabel);
    if (!normalized) {
      throw new Error('Invalid self label');
    }
    session.selfLabel = {
      value: normalized,
      updatedAt: Date.now(),
    };
    return session.selfLabel;
  }

  startAd(sessionId, payload = {}) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.verification || !session.verification.accepted) {
      throw new Error('Answer not verified');
    }

    session.ad = {
      adSessionId: randomId('ad'),
      provider: payload.provider || 'mock_llm_ad',
      adUnitId: payload.adUnitId || 'default_ad_unit',
      startedAt: Date.now(),
      requiredSeconds: this.adRequiredSeconds,
      events: [],
      completedAt: null,
      llmActions: [],
    };
    return session.ad;
  }

  recordAdEvent(sessionId, payload) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.ad) throw new Error('Ad not started');
    if (payload.adSessionId !== session.ad.adSessionId) throw new Error('Ad session mismatch');

    const eventType = String(payload.eventType || '').trim().toLowerCase();
    if (!AD_EVENTS.has(eventType)) {
      throw new Error('Unsupported ad event type');
    }

    const event = {
      eventType,
      timestamp: Date.now(),
      meta: payload.meta || {},
    };
    session.ad.events.push(event);
    return event;
  }

  recordLlmAdAction(sessionId, payload) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.ad) throw new Error('Ad not started');
    if (payload.adSessionId !== session.ad.adSessionId) throw new Error('Ad session mismatch');

    const action = {
      action: payload.action,
      reason: payload.reason || '',
      timestamp: Date.now(),
    };
    session.ad.llmActions.push(action);
    return action;
  }

  completeAd(sessionId, payload) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.ad) throw new Error('Ad not started');
    if (payload.adSessionId !== session.ad.adSessionId) throw new Error('Ad session mismatch');

    const now = Date.now();
    const elapsedMs = now - session.ad.startedAt;
    const requiredMs = session.ad.requiredSeconds * 1000;
    if (elapsedMs < requiredMs) {
      throw new Error(`Ad playback too short: ${elapsedMs}ms/${requiredMs}ms`);
    }

    session.ad.completedAt = now;
    return {
      completed: true,
      elapsedMs,
      requiredMs,
    };
  }

  canClaim(sessionId) {
    const session = this.ensureActiveSession(sessionId);
    if (!session.verification || !session.verification.accepted) {
      return { ok: false, reason: 'answer_not_verified' };
    }
    if (!session.ad || !session.ad.completedAt) {
      return { ok: false, reason: 'ad_not_completed' };
    }
    if (session.mode === 'data_collection' && !session.selfLabel) {
      return { ok: false, reason: 'self_label_missing' };
    }
    if (session.claimed) {
      return { ok: false, reason: 'already_claimed' };
    }
    return { ok: true };
  }

  markClaimed(sessionId, attestationToken) {
    const session = this.ensureActiveSession(sessionId);
    session.claimed = true;
    session.attestationToken = attestationToken || null;
    return session;
  }

  cleanupExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        removed += 1;
      }
    }
    return removed;
  }
}

module.exports = {
  SessionManager,
  normalizeMode,
  normalizeSelfLabel,
  FLOW_MODES,
  SELF_LABELS,
  AD_EVENTS,
};
