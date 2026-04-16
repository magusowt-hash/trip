import imageCompression from 'browser-image-compression';

const IMAGE_COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 2048,
  useWebWorker: true,
};

export async function compressImage(file: File): Promise<File> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  if (ext === 'webp') {
    return file;
  }
  
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    const compressedFile = await imageCompression(file, {
      ...IMAGE_COMPRESSION_OPTIONS,
      maxSizeMB: 1,
    });
    return compressedFile;
  } catch (error) {
    console.warn('Image compression failed, using original:', error);
    return file;
  }
}