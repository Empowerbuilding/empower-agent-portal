import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Use bracket notation to prevent Next.js from statically inlining env vars at build time
function getSpacesClient() {
  return new S3Client({
    region: process['env']['DO_SPACES_REGION'] || 'sfo3',
    endpoint: process['env']['DO_SPACES_ENDPOINT'] || 'https://sfo3.digitaloceanspaces.com',
    credentials: {
      accessKeyId: process['env']['DO_SPACES_ACCESS_KEY'] || '',
      secretAccessKey: process['env']['DO_SPACES_SECRET_KEY'] || '',
    },
    forcePathStyle: false,
  });
}

export const BUCKET = process['env']['DO_SPACES_BUCKET'] || 'barnhaus-project-files';

// Strip AWS SDK v3 checksum params that DO Spaces doesn't support
function stripChecksumParams(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('x-amz-checksum-crc32');
  u.searchParams.delete('x-amz-sdk-checksum-algorithm');
  u.searchParams.delete('x-amz-checksum-crc32c');
  u.searchParams.delete('x-amz-checksum-sha1');
  u.searchParams.delete('x-amz-checksum-sha256');
  u.searchParams.delete('x-amz-checksum-mode');
  return u.toString();
}

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const client = getSpacesClient();
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: 900 });
  return stripChecksumParams(url);
}

export async function getDownloadUrl(key: string, filename: string): Promise<string> {
  const client = getSpacesClient();
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  const url = await getSignedUrl(client, cmd, { expiresIn: 3600 }); // 1 hour
  return stripChecksumParams(url);
}

export function getSpacesClientDirect() {
  return getSpacesClient();
}
