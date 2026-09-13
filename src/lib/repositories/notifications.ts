import { endpoints } from '@/lib/api/endpoints';
import type { NotificationDto, PageDto } from '@/types/api';
import type { Notification, Page } from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface NotificationRepository {
  list(input?: { cursor?: string; unreadOnly?: boolean }, options?: RequestOptions): Promise<Page<Notification>>;
  markRead(notificationId: string): Promise<Notification>;
  markAllRead(): Promise<void>;
}

export function createNotificationRepository(client: RepositoryClient): NotificationRepository {
  return {
    list: (input, options) =>
      client.get<PageDto<NotificationDto>>(
        endpoints.notifications.list,
        { cursor: input?.cursor, unreadOnly: input?.unreadOnly || undefined },
        options,
      ),
    markRead: (notificationId) => client.post<NotificationDto>(endpoints.notifications.read(notificationId)),
    markAllRead: () => client.post<void>(endpoints.notifications.readAll),
  };
}
