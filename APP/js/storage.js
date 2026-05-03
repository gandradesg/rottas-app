// Upload de fotos para o Supabase Storage com compressão básica
import { supabase, state } from './supabase.js';
import { PHOTO_BUCKET } from './config.js';

// Compressa imagem antes de upload (max 1600px no maior lado, JPEG 80%)
export async function compressImage(file, maxSize = 1600, quality = 0.82) {
  const img = await loadImage(file);
  const { width, height } = scaleSize(img.width, img.height, maxSize);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', quality));
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
  const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg','jpg');
  const fileName = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(fileName, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
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
