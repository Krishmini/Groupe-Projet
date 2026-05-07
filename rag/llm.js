// llm.js — Appel API Mistral avec retry, timeout et circuit breaker (J5 Phase 1)
import { MISTRAL_API_KEY, CHAT_MODEL } from '../config.js';

// CircuitBreaker : CLOSED → 5 échecs → OPEN (refuse 30s) → HALF_OPEN → auto-recovery
class CircuitBreaker {
  constructor({ threshold = 5, timeout = 30000 } = {}) {
    this.threshold     = threshold;
    this.timeout       = timeout;
    this.failureCount  = 0;
    this.state         = 'CLOSED';
    this.nextAttemptAt = 0;
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new Error(`[CircuitBreaker] Circuit ouvert — requêtes refusées pendant ${Math.round((this.nextAttemptAt - Date.now()) / 1000)}s`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  _onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.timeout;
      console.error('[CircuitBreaker] Circuit ouvert');
    }
  }
}

const llmBreaker = new CircuitBreaker({ threshold: 5, timeout: 30000 });

// withRetry : backoff exponentiel 2^n × base + jitter, uniquement sur 429/503
export async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable = err.message.includes('429') || err.message.includes('503');
      if (!isRetryable || attempt === maxRetries - 1) throw err;

      const delay = Math.pow(2, attempt) * baseDelay + Math.random() * 500;
      console.warn(`  [withRetry] Tentative ${attempt + 1}/${maxRetries} dans ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// callLLM : timeout (AbortController 30s) + circuit breaker + retry
export async function callLLM(messages, options = {}) {
  const { timeout = 30000, model = CHAT_MODEL, max_tokens = 512 } = options;

  return llmBreaker.call(() =>
    withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${MISTRAL_API_KEY}`
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_tokens
          }),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`Mistral chat → HTTP ${res.status}`);
        }

        const data = await res.json();
        return {
          content: data.choices[0].message.content.trim(),
          usage:   data.usage || { prompt_tokens: 0, completion_tokens: 0 }
        };
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error(`Timeout LLM après ${timeout}ms`);
        }
        throw err;
      }
    })
  );
}
