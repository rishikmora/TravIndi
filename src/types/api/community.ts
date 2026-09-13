import type { ID, ISODateTime } from './common';

export interface CommunityChannelDto {
  channel_id: ID;
  destination_id: ID;
  slug: 'general' | 'food' | 'heritage' | 'events' | 'questions';
  name: string;
  description: string;
  post_count: number;
}

export interface CommunityPostDto {
  post_id: ID;
  channel_id: ID;
  author_name: string;
  /** Contributor context the backend can substantiate, e.g. verified local guide. */
  author_badge: 'verified_guide' | 'verified_business' | 'local' | null;
  title: string;
  body: string;
  tags: string[];
  created_at: ISODateTime;
  reply_count: number;
  helpful_count: number;
  marked_helpful_by_me: boolean;
}

export interface CreateCommunityPostRequestDto {
  channel_id: ID;
  title: string;
  body: string;
  tags: string[];
}
