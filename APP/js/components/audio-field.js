// Transcrição: Web Speech API (Chrome/Edge/Safari) + Whisper opcional
import { el, icon, toast } from '../ui.js';

export function audioField({ targetTextarea }) {
  const wrap = el('div', { class: 'flex flex-col gap-2' });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasWebSpeech = !!SR;
  const hasWhisperKey = !!localStorage.getItem('rottas-openai-key');

  let recognition = null;
  let dictating = false;
  let interimSpan = null;

  const dictBtn = el('button', {
    type: 'button',
    class: 'btn btn-secondary btn-sm flex-1 flex items-center justify-center gap-2',
    disabled: !hasWebSpeech,
  }, icon('mic', 16), el('span', {}, 'Ditar'));

  function setDictBtn(state) {
    dictBtn.innerHTML = '';
    if (state === 'rec') {
      dictBtn.append(
        el('span', { class: 'inline-block w-2 h-2 rounded-full bg-white animate-pulse-soft' }),
        el('span', {}, 'Parar'),
      );
      dictBtn.classList.remove('btn-secondary');
      dictBtn.classList.add('btn-danger');
    } else {
      dictBtn.append(icon('mic', 16), el('span', {}, 'Ditar'));
      dictBtn.classList.remove('btn-danger');
      dictBtn.classList.add('btn-secondary');
    }
  }

  function startDictation() {
    if (!hasWebSpeech) { toast('Seu navegador não suporta ditado. Use Chrome ou Edge.', 'error'); return; }
    recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let baseText = targetTextarea.value;
    if (baseText && !baseText.endsWith('\n') && !baseText.endsWith(' ')) baseText += ' ';

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) {
        baseText += finalText;
        targetTextarea.value = baseText;
      }
      if (interimSpan) interimSpan.textContent = interimText
        ? `escutando: "${interimText.trim()}..."`
        : '🎙️ Falando...';
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed') { toast('Permissão de microfone negada', 'error'); stopDictation(); }
      else { toast('Erro: ' + e.error, 'error'); stopDictation(); }
    };

    recognition.onend = () => {
      if (dictating) { try { recognition.start(); } catch(e) {} }
      else { setDictBtn('idle'); if (interimSpan) interimSpan.textContent = ''; }
    };

    try {
      recognition.start();
      dictating = true;
      setDictBtn('rec');
      if (interimSpan) interimSpan.textContent = '🎙️ Falando...';
    } catch (e) {
      toast('Erro ao iniciar ditado: ' + e.message, 'error');
      dictating = false;
      setDictBtn('idle');
    }
  }

  function stopDictation() {
    dictating = false;
    if (recognition) { try { recognition.stop(); } catch(e) {} }
    setDictBtn('idle');
    if (interimSpan) interimSpan.textContent = '';
  }

  dictBtn.addEventListener('click', () => {
    if (dictating) stopDictation();
    else startDictation();
  });
  setDictBtn('idle');

  // Whisper (opcional, só aparece se chave configurada)
  let mediaRecorder = null, chunks = [], recordingStart = 0, timerInterval = null;
  const recBtn = hasWhisperKey ? el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm flex items-center gap-1.5 text-xs',
    title: 'Gravar áudio + transcrever via Whisper',
  }, '🎙️', el('span', {}, 'Whisper')) : null;

  if (recBtn) {
    recBtn.addEventListener('click', async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        chunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = async () => {
          clearInterval(timerInterval);
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: mime });
          recBtn.innerHTML = ''; recBtn.append(document.createTextNode('🎙️ '), el('span', {}, 'Whisper'));
          renderRecorded(blob);
        };
        mediaRecorder.start();
        recordingStart = Date.now();
        recBtn.innerHTML = ''; recBtn.append(document.createTextNode('⏹️ '), el('span', {}, 'Parar (00:00)'));
        timerInterval = setInterval(() => {
          const s = Math.floor((Date.now() - recordingStart) / 1000);
          const mm = String(Math.floor(s/60)).padStart(2,'0');
          const ss = String(s%60).padStart(2,'0');
          recBtn.lastChild.textContent = ` Parar (${mm}:${ss})`;
        }, 250);
      } catch (err) { toast(err.message || 'Erro ao acessar microfone', 'error'); }
    });
  }

  function renderRecorded(blob) {
    extra.innerHTML = '';
    const url = URL.createObjectURL(blob);
    const audio = el('audio', { src: url, controls: true, class: 'w-full h-9 mt-2' });
    const tBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm flex-1' }, '✨ Transcrever');
    const dBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm',
      onclick: () => { URL.revokeObjectURL(url); extra.innerHTML = ''; }
    }, 'Descartar');
    tBtn.addEventListener('click', async () => {
      const key = localStorage.getItem('rottas-openai-key');
      tBtn.disabled = true; tBtn.textContent = 'Transcrevendo...';
      try {
        const text = await transcribeWhisper(blob, key);
        const cur = targetTextarea.value.trim();
        targetTextarea.value = cur ? `${cur}\n${text}` : text;
        toast('Transcrito!', 'success'); extra.innerHTML = '';
      } catch (e) { toast('Erro: ' + (e.message || 'falha'), 'error'); tBtn.disabled = false; tBtn.textContent = '✨ Transcrever'; }
    });
    extra.append(audio, el('div', { class: 'flex gap-2 mt-2' }, tBtn, dBtn));
  }

  interimSpan = el('span', { class: 'text-xs text-fg-subtle italic' });
  const extra = el('div', {});

  wrap.append(
    recBtn ? el('div', { class: 'flex gap-2 items-center' }, dictBtn, recBtn) : dictBtn,
    interimSpan,
    extra,
  );
  return wrap;
}

async function transcribeWhisper(blob, apiKey) {
  const fd = new FormData();
  fd.append('file', blob, 'audio.webm');
  fd.append('model', 'whisper-1');
  fd.append('language', 'pt');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.text || '';
}
