import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getGlobalPosts } from '@/lib/shared-data';
import sharp from 'sharp';
import { db } from '@/db';
import { uploadedFiles } from '@/db/schema';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
const THUMBNAIL_SIZE = 200;

const getUploadDir = async () => {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
  return UPLOAD_DIR;
};

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

async function compressWithSharp(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  const ext = mimeType.split('/')[1] || 'jpg';
  
  let transformer = sharp(inputBuffer);
  
  const metadata = await transformer.metadata();
  
  if (metadata.width && metadata.width > 2048) {
    transformer = transformer.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true });
  }
  
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return transformer.jpeg({ quality: 85 }).toBuffer();
  } else if (mimeType === 'image/png') {
    return transformer.png({ quality: 85, compressionLevel: 9 }).toBuffer();
  } else if (mimeType === 'image/webp') {
    return transformer.webp({ quality: 85 }).toBuffer();
  } else if (mimeType === 'image/gif') {
    return transformer.gif().toBuffer();
  }
  
  return inputBuffer;
}

async function createThumbnail(inputBuffer: Buffer, mimeType: string): Promise<Buffer> {
  let transformer = sharp(inputBuffer);
  
  transformer = transformer.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
    fit: 'cover',
    position: 'center',
  });

  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return transformer.jpeg({ quality: 75 }).toBuffer();
  } else if (mimeType === 'image/png') {
    return transformer.png({ quality: 75 }).toBuffer();
  } else if (mimeType === 'image/webp') {
    return transformer.webp({ quality: 75 }).toBuffer();
  } else if (mimeType === 'image/gif') {
    return transformer.gif().toBuffer();
  }

  return transformer.toBuffer();
}

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    let userId = await getCurrentUserId(request);
    // Debug header for testing
    const debugUserId = request.headers.get('x-debug-user-id');
    if (debugUserId) {
      userId = parseInt(debugUserId, 10);
      console.log('Using debug user ID for upload:', userId);
    }
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    let buffer = Buffer.from(bytes);

    const mimeType = file.type;
    const ext = file.name.split('.').pop() || 'jpg';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    let finalExt = ext;
    let thumbnailUrl = '';
    
    if (IMAGE_MIME_TYPES.includes(mimeType)) {
      try {
        const compressed = await compressWithSharp(buffer, mimeType);
        buffer = Buffer.from(compressed);
        
        const thumbnailBuffer = await createThumbnail(buffer, mimeType);
        
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
          finalExt = 'jpg';
        } else if (mimeType === 'image/png') {
          finalExt = 'png';
        } else if (mimeType === 'image/webp') {
          finalExt = 'webp';
        } else if (mimeType === 'image/gif') {
          finalExt = 'gif';
        }
        
        const thumbFilename = `${id}_thumb.${finalExt}`;
        const uploadDir = await getUploadDir();
        await writeFile(join(uploadDir, thumbFilename), thumbnailBuffer);
        thumbnailUrl = `/uploads/${thumbFilename}`;
      } catch (compressError) {
        console.warn('Backend compression failed, using original:', compressError);
      }
    }
    
    const filename = `${id}.${finalExt}`;
    const uploadDir = await getUploadDir();
    const filepath = join(uploadDir, filename);
    
    await writeFile(filepath, buffer);
    
    const url = `/uploads/${filename}`;
    
    const { uploaded } = getGlobalPosts();
    uploaded.push({ id, url, thumbnailUrl: thumbnailUrl || url });

    // Insert into database for persistence
    await db.insert(uploadedFiles).values({
      id,
      userId,
      url,
      thumbnailUrl: thumbnailUrl || url,
    });
    
    return NextResponse.json({ id, url, thumbnailUrl: thumbnailUrl || url }, { status: 201 });
  } catch (error) {
    console.error('POST /api/upload error:', error);
    return NextResponse.json({ error: '上传失败', message: String(error) }, { status: 500 });
  }
}