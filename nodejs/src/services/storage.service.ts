import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

export class StorageService {
  private s3Client: S3Client
  public readonly bucket: string
  public readonly publicUrl: string

  constructor () {
    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000'
    const region = process.env.S3_REGION || 'us-east-1'

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    })

    this.bucket = process.env.S3_BUCKET || 'clawdeck'
    this.publicUrl = process.env.S3_PUBLIC_URL || endpoint
  }

  generateKey (filename: string): string {
    const ext = filename.split('.').pop() as string
    const hash = crypto.randomBytes(16).toString('hex')
    return `avatars/${hash}.${ext}`
  }

  async uploadAvatar (
    userId: string | number,
    fileBuffer: Buffer,
    filename: string,
    contentType: string
  ): Promise<{ url: string; key: string }> {
    const key = this.generateKey(filename)

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })

    await this.s3Client.send(command)

    const prisma = (await import('../db/prisma.js')).prisma
    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { avatarUrl: `${this.publicUrl}/${this.bucket}/${key}` },
    })

    await this.createActiveStorageRecord(BigInt(userId), key, filename, contentType, fileBuffer.length)

    return {
      url: `${this.publicUrl}/${this.bucket}/${key}`,
      key,
    }
  }

  async deleteAvatar (userId: string | number): Promise<void> {
    const prisma = (await import('../db/prisma.js')).prisma
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
    })

    if (!user || !user.avatarUrl) {
      return
    }

    const key = this.extractKeyFromUrl(user.avatarUrl)
    if (key) {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })

      await this.s3Client.send(command)
    }

    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { avatarUrl: null },
    })
  }

  extractKeyFromUrl (url: string): string | null {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      const bucketIndex = pathParts.indexOf(this.bucket)
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        return pathParts.slice(bucketIndex + 1).join('/')
      }
      return null
    } catch {
      return null
    }
  }

  async createActiveStorageRecord (
    userId: bigint,
    key: string,
    filename: string,
    contentType: string,
    byteSize: number
  ): Promise<void> {
    const prisma = (await import('../db/prisma.js')).prisma

    const blob = await prisma.activeStorageBlob.create({
      data: {
        key,
        filename,
        contentType,
        byteSize: BigInt(byteSize),
        checksum: crypto.createHash('md5').update(key).digest('hex'),
        serviceName: 'minio',
        metadata: {},
      },
    })

    await prisma.activeStorageAttachment.create({
      data: {
        name: 'avatar',
        recordType: 'User',
        recordId: BigInt(userId),
        blobId: blob.id,
      },
    })
  }

  async getSignedUploadUrl (
    key: string,
    contentType: string,
    expiresIn = 300
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })

    return getSignedUrl(this.s3Client, command, { expiresIn })
  }

  async getSignedDownloadUrl (key: string, expiresIn = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    return getSignedUrl(this.s3Client, command, { expiresIn })
  }

  async ensureBucket (): Promise<void> {
    try {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3')
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        const { CreateBucketCommand } = await import('@aws-sdk/client-s3')
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }))
      }
    }
  }
}

export function createStorageService (): StorageService {
  return new StorageService()
}
