// Tope del archivo que se deja elegir ANTES de comprimir -- solo para evitar
// que el navegador intente decodificar algo absurdamente pesado (una foto de
// celular normal pesa 2-8MB y entra sin problema). El peso final que
// realmente se guarda lo define comprimirImagen() de abajo.
export const ARCHIVO_ORIGEN_MAX = 15_000_000;
// Lado más largo al que se reduce la imagen -- de sobra para una tarjeta/
// miniatura del panel, no hace falta más resolución que esa.
const DIMENSION_MAX = 1280;
// Peso aproximado (bytes) al que se apunta comprimiendo: se guarda como data
// URI en la misma columna de la base (igual patrón que hoteles.logo_url, sin
// bucket de storage -- ver comentario en sql/schema.sql), así que mientras
// más liviano, menos espacio ocupa el catálogo completo.
const PESO_OBJETIVO_BYTES = 200_000;

// Reduce cualquier imagen a JPEG, achicando resolución y bajando calidad
// hasta acercarse a PESO_OBJETIVO_BYTES (máximo 6 intentos, para no colgar
// el navegador con una imagen que simplemente no comprime más). Compartida
// entre FotosHabitacionModal.tsx y FotosCocheraModal.tsx.
export async function comprimirImagen(archivo: File): Promise<string> {
  const img = await cargarImagen(archivo);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');

  let escala = Math.min(1, DIMENSION_MAX / Math.max(img.width, img.height));
  let calidad = 0.75;
  let dataUrl = '';

  for (let intento = 0; intento < 6; intento++) {
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL('image/jpeg', calidad);

    const pesoAprox = (dataUrl.length * 3) / 4; // base64 -> bytes, aproximado
    if (pesoAprox <= PESO_OBJETIVO_BYTES) break;
    if (calidad > 0.4) calidad -= 0.15;
    else escala *= 0.8;
  }
  return dataUrl;
}

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}
