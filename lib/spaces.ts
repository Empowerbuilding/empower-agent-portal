import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { RequestChecksumCalculation, ResponseChecksumValidation } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const spacesClient = new S3Client({
  region: process.env.DO_SPACES_REGION!,
  endpoint: process.env.DO_SPACES_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET_KEY!,
  },
  forcePathStyle: false,
  requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED,
  responseChecksumValidation: ResponseChecksumValidation.WHEN_REQUIRED,
})

export const BUCKET = process.env.DO_SPACES_BUCKET!;

export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: 'private',
    ChecksumAlgorithm: undefined,
  });
  return getSignedUrl(spacesClient, cmd, { expiresIn: 900 }); // 15 min
}

export async function getDownloadUrl(key: string, filename: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });
  return getSignedUrl(spacesClient, cmd, { expiresIn: 3600 }); // 1 hour
}
