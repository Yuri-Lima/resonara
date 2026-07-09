import { Logger } from '@nestjs/common';
import {
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/jobs',
  cors: { origin: '*' },
})
export class JobsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(JobsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`WS client ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, @MessageBody() data: { jobId: string }) {
    if (data?.jobId) {
      client.join(`job:${data.jobId}`);
      return { ok: true, room: `job:${data.jobId}` };
    }
    return { ok: false };
  }

  emitProgress(jobId: string, progress: number, type?: string) {
    this.server?.to(`job:${jobId}`).emit('job:progress', {
      jobId,
      progress,
      type,
    });
  }

  emitCompleted(jobId: string, entity: unknown) {
    this.server?.to(`job:${jobId}`).emit('job:completed', { jobId, entity });
  }

  emitFailed(jobId: string, error: string) {
    this.server?.to(`job:${jobId}`).emit('job:failed', { jobId, error });
  }

  /** Streaming preview: a synthesized chunk is ready for progressive playback. */
  emitChunkReady(
    jobId: string,
    payload: {
      chunkIndex: number;
      totalChunks: number;
      url: string;
      durationMs?: number;
    },
  ) {
    this.server?.to(`job:${jobId}`).emit('tts:chunk:ready', {
      jobId,
      ...payload,
    });
  }

  emitBatchProgress(payload: {
    batchId: string;
    completedJobs: number;
    totalJobs: number;
    currentJobId?: string;
    currentJobProgress?: number;
  }) {
    this.server?.emit('tts:batch:progress', payload);
  }
}
