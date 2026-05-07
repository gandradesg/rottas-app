// Captura de geolocalização
export async function getLocation(opts = {}) {
  if (!navigator.geolocation) {
    throw new Error('Geolocalização não suportada neste navegador');
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => {
        const msgs = {
          1: 'Permissão de localização negada',
          2: 'Localização indisponível',
          3: 'Tempo esgotado ao obter localização',
        };
        reject(new Error(msgs[err.code] || err.message));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...opts }
    );
  });
}

export function gmapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
