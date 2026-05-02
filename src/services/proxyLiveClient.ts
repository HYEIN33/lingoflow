/**
 * 代理 WebSocket 客户端 —— 跟 Deepgram SDK 同形 API。
 *
 * 用 Cloud Run 中转替代浏览器直连 Deepgram 时的客户端。我们后端服务器
 * (proxy/src/server.js) 充当 Deepgram 客户端，浏览器只跟 Cloud Run 说
 * 话。后端把 Deepgram 的 Results / UtteranceEnd / SpeechStarted /
 * Metadata 事件以 JSON 文本帧形式转发给浏览器；浏览器把 PCM 二进制帧
 * 反向送给后端，后端再转给 Deepgram。
 *
 * 为什么要这层抽象：现有 liveSession.ts 用的是 @deepgram/sdk 的事件
 * 模型（conn.on(LiveTranscriptionEvents.Transcript, …)）。我们让代理
 * 客户端假装也是同一个 API，liveSession.ts 改动量最小 —— 只换"工厂
 * 函数"那一行。
 *
 * 鉴权：浏览器原生 WebSocket 不允许设自定义 header，约定把 Firebase
 * ID token 塞在子协议里：第一个固定 "memeflow.v1"，第二个 "token.<JWT>"。
 * 后端校验通过才完成升级。
 */

import { auth } from '../firebase';

export interface ProxyLiveClientOptions {
  proxyWsUrl: string;            // wss://memeflow-proxy-xxxx.run.app
  liveOpts: Record<string, any>; // Deepgram live params (model / encoding 等)
}

type EventName = 'open' | 'transcript' | 'utterance_end' | 'speech_started' | 'metadata' | 'close' | 'error';

export class ProxyLiveClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<EventName, Set<(data: any) => void>>();
  private opened = false;
  private closed = false;

  constructor(private opts: ProxyLiveClientOptions) {}

  async connect(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('未登录，无法连接代理');
    const idToken = await user.getIdToken();

    // 把 Deepgram 配置作为 query string 传给后端
    const params = new URLSearchParams();
    if (this.opts.liveOpts.model) params.set('model', this.opts.liveOpts.model);
    if (this.opts.liveOpts.language) params.set('language', this.opts.liveOpts.language);
    if (this.opts.liveOpts.endpointing) params.set('endpointing', String(this.opts.liveOpts.endpointing));
    if (this.opts.liveOpts.utterance_end_ms) params.set('utterance_end_ms', String(this.opts.liveOpts.utterance_end_ms));
    if (Array.isArray(this.opts.liveOpts.keyterm) && this.opts.liveOpts.keyterm.length > 0) {
      // 用 | 分隔 keyterms（避免和 query string 的 , 冲突）
      params.set('keyterm', this.opts.liveOpts.keyterm.join('|'));
    }
    const url = `${this.opts.proxyWsUrl}/?${params.toString()}`;

    // 浏览器 WebSocket 子协议是唯一能在握手阶段塞自定义鉴权数据的方式。
    // 第一个值是协议版本标识；token. 前缀让后端能从 protocols 列表里
    // 一眼挑出来。
    const protocols = ['memeflow.v1', `token.${idToken}`];
    this.ws = new WebSocket(url, protocols);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      // open 事件先不暴露 —— 我们等后端发 proxy_status=live 才认为
      // "Deepgram 已连接"。这跟 SDK 行为一致：SDK 的 Open 也是 WS 握手
      // 完成那一刻，但识别管线就绪是另一回事。
      // eslint-disable-next-line no-console
      console.info('[proxy] WebSocket handshake open');
    };

    this.ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return; // 后端不会给浏览器发二进制
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      // 后端自定义控制帧
      if (msg.type === 'proxy_status') {
        if (msg.status === 'live' && !this.opened) {
          this.opened = true;
          this.emit('open', null);
        } else if (msg.status === 'error') {
          this.emit('error', { message: msg.detail || 'proxy error' });
        }
        return;
      }
      // Deepgram 转发帧 —— type 字段直接对应 SDK 的事件名
      switch (msg.type) {
        case 'Results':
          this.emit('transcript', msg);
          break;
        case 'UtteranceEnd':
          this.emit('utterance_end', msg);
          break;
        case 'SpeechStarted':
          this.emit('speech_started', msg);
          break;
        case 'Metadata':
          this.emit('metadata', msg);
          break;
        default:
          // 未知 type 不当 error，可能是 Deepgram 新加的字段。
          break;
      }
    };

    this.ws.onclose = (ev) => {
      this.closed = true;
      this.emit('close', { code: ev.code, reason: ev.reason });
    };

    this.ws.onerror = (ev) => {
      this.emit('error', { message: 'WebSocket error', event: ev });
    };
  }

  on(event: EventName, listener: (data: any) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  private emit(event: EventName, data: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(data); } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[proxy] listener for ${event} threw:`, e);
      }
    }
  }

  send(data: ArrayBuffer | string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(data);
    } catch {
      // socket 死了 —— 让 onclose 走重连路径
    }
  }

  /** 强制 finalize（让 Deepgram 把 buffer 里的内容立刻吐出来）*/
  finalize(): void {
    this.send(JSON.stringify({ type: 'CloseStream' }));
  }

  /** 优雅关闭 */
  requestClose(): void {
    if (this.closed) return;
    try {
      this.ws?.close(1000, 'client requested close');
    } catch { /* 已经关了 */ }
  }

  isOpen(): boolean {
    return this.opened && !this.closed && this.ws?.readyState === WebSocket.OPEN;
  }
}
