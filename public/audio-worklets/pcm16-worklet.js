/**
 * PCM 16 kHz mono worklet.
 *
 * Browsers give us Float32 samples at the device's native rate (usually
 * 44100 or 48000). Gemini Live wants PCM 16-bit signed little-endian at
 * 16000 Hz. This worklet:
 *   1. downmixes to mono (if stereo)
 *   2. resamples to 16 kHz by linear interpolation — good enough for speech
 *   3. clamps + converts Float32 [-1, 1] → Int16
 *   4. batches ~250 ms at a time and posts to the main thread
 *
 * We intentionally avoid a fancier sinc resampler — the latency budget for
 * live translation is measured in hundreds of ms and linear interpolation
 * is indistinguishable from sinc at speech frequencies. The main cost we
 * optimize for is CPU on the audio thread (never block).
 */
/* eslint-disable no-restricted-globals */
/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentFrame */

const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHUNK_MS = 250;
const TARGET_CHUNK_SAMPLES = (TARGET_SAMPLE_RATE * TARGET_CHUNK_MS) / 1000;

class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer for resampled samples that haven't been flushed yet.
    // Sized generously so a single process() pass never overflows; on the
    // common case it's way under capacity.
    this.pending = new Int16Array(TARGET_CHUNK_SAMPLES * 4);
    this.pendingLen = 0;
    this.inputRate = sampleRate; // globalThis.sampleRate from AudioWorkletGlobalScope
    this.resampleRatio = this.inputRate / TARGET_SAMPLE_RATE;
    this.positionFrac = 0; // sub-sample position carried across process() calls
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    // Downmix to mono by averaging channels. Most mics are mono already;
    // Zoom/Teams tab audio is usually stereo but speech collapses to mono
    // cleanly.
    const frameCount = input[0].length;
    if (frameCount === 0) return true;
    const mono = new Float32Array(frameCount);
    if (input.length === 1) {
      mono.set(input[0]);
    } else {
      for (let i = 0; i < frameCount; i++) {
        let sum = 0;
        for (let ch = 0; ch < input.length; ch++) sum += input[ch][i];
        mono[i] = sum / input.length;
      }
    }

    // Resample by linear interpolation. positionFrac preserves phase
    // between process() calls so we don't get periodic clicking at block
    // boundaries.
    let pos = this.positionFrac;
    while (pos < frameCount - 1) {
      const i0 = Math.floor(pos);
      const i1 = i0 + 1;
      const frac = pos - i0;
      const sample = mono[i0] * (1 - frac) + mono[i1] * frac;
      // Float32 → Int16 with clipping guard
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = Math.round(clamped * 32767);
      if (this.pendingLen < this.pending.length) {
        this.pending[this.pendingLen++] = int16;
      }
      pos += this.resampleRatio;
    }
    this.positionFrac = pos - frameCount;

    // Flush whenever we've accumulated a full chunk.
    while (this.pendingLen >= TARGET_CHUNK_SAMPLES) {
      const chunk = this.pending.slice(0, TARGET_CHUNK_SAMPLES);
      this.port.postMessage({ type: 'chunk', pcm: chunk.buffer }, [chunk.buffer]);
      // Slide remaining samples to the front of the buffer.
      this.pending.copyWithin(0, TARGET_CHUNK_SAMPLES, this.pendingLen);
      this.pendingLen -= TARGET_CHUNK_SAMPLES;
    }

    return true;
  }
}

registerProcessor('pcm16-worklet', PCM16Processor);
