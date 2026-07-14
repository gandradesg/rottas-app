// Upload de fotos para o Supabase Storage com compressão básica
import { supabase, state } from './supabase.js';
import { PHOTO_BUCKET } from './config.js';

// Compressa imagem antes de upload (max 1600px no maior lado, JPEG 80%).
// Se algo falhar (canvas retorna nulo, memória, etc.), REJEITA — quem chama
// (uploadPhoto) cai no plano B e sobe o arquivo original.
export async function compressImage(file, maxSize = 1600, quality = 0.82) {
  const img = await loadImage(file);
  const { width, height } = scaleSize(img.width, img.height, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((res, rej) =>
    canvas.toBlob(b => (b && b.size > 0) ? res(b) : rej(new Error('compressão retornou vazio')), 'image/jpeg', quality));
}

function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function scaleSize(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  if (w >= h) return { width: max, height: Math.round(h * max / w) };
  return { width: Math.round(w * max / h), height: max };
}

export async function uploadPhoto(file) {
  // Tenta comprimir; se a compressão falhar (HEIC do iPhone, imagem enorme, canvas
  // sem memória, etc.), sobe o ARQUIVO ORIGINAL em vez de quebrar o registro todo.
  let blob = file;
  if (file && typeof file.type === 'string' && file.type.startsWith('image/')) {
    try {
      const comp = await compressImage(file);
      if (comp && comp.size > 0) blob = comp;
    } catch (e) { /* mantém o original */ }
  }
  const type = (blob && blob.type) || 'image/jpeg';
  const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const fileName = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(fileName, blob, { contentType: type, upsert: false });
  if (error) throw new Error(error.message || error.error || 'falha no upload da foto');
  const { data: { publicUrl } } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(fileName);
  return publicUrl;
}

// Upload em paralelo (mais rápido que sequencial)
export async function uploadPhotos(files, onProgress) {
  let done = 0;
  const total = files.length;
  const promises = files.map(f => uploadPhoto(f).then(url => {
    done++;
    if (onProgress) onProgress(done, total);
    return url;
  }));
  return Promise.all(promises);
}
