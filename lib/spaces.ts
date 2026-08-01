import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const spacesClient = new S3Client({
  region: process.env.DO_SPACES_REGION!,
  endpoint: process.env.DO_SPACES_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET_KEY!,
  },
  forcePathStyle: false,
});

// Strip AWS SDK v3 checksum params that DO Spaces doesn't support
function stripChecksumParams(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('x-amz-checksum-crc32');
  u.searchParams.delete('x-amz-sdk-checksum-algorithm');
  u.searchParams.delete('x-amz-checksum-crc32c');
  u.searchParams.delete('x-amz-checksum-sha1');
  u.searchParams.delete('x-amz-checksum-sha256');
  return u.toString();
}

export const BUCKET = process.env.DO_SPACES_BUCKET!;

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(spacesClient, cmd, { expiresIn: 900 });
  return stripChecksumParams(url);
}

export async function getDownloadUrl(key: string, filename: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  return getSignedUrl(spacesClient, cmd, { expiresIn: 3600 }); // 1 hour
}
