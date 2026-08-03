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
    // Prevent SDK v3 from injecting checksum params DO Spaces doesn't support
    requestChecksumCalculation: 'when_required' as any,
    responseChecksumValidation: 'when_required' as any,
  });
}

export const BUCKET = process['env']['DO_SPACES_BUCKET'] || 'barnhaus-project-files';

// Strip any residual AWS SDK v3 checksum params that DO Spaces doesn't support.
// NOTE: only safe to strip params that were NOT included in the signature.
// For presigned URLs, strip only unsigned extras added after signing.
function stripUnsignedChecksumParams(url: string): string {
  const u = new URL(url);
  // These are added outside the signature scope — safe to remove
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
  return getSignedUrl(client, cmd, { expiresIn: 900 });
}

export async function getDownloadUrl(key: string, filename: string): Promise<string> {
  const client = getSpacesClient();
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  return getSignedUrl(client, cmd, { expiresIn: 3600 }); // 1 hour
}

export function getSpacesClientDirect() {
  return getSpacesClient();
}
