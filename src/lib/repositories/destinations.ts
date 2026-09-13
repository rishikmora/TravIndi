import { endpoints } from '@/lib/api/endpoints';
import type {
  CommunityChannelDto,
  CommunityPostDto,
  DestinationCategory,
  DestinationDto,
  DestinationSummaryDto,
  PageDto,
  SearchResponseDto,
  SearchResultType,
} from '@/types/api';
import type {
  CommunityChannel,
  CommunityPost,
  CommunityPostInput,
  Destination,
  DestinationSummary,
  Page,
  SearchResponse,
} from '@/types/domain';
import type { RepositoryClient, RequestOptions } from './client';

export interface DestinationListQuery {
  q?: string;
  category?: DestinationCategory;
  region?: string;
  hiddenGems?: boolean;
  cursor?: string;
  limit?: number;
}

export interface DestinationRepository {
  list(query?: DestinationListQuery, options?: RequestOptions): Promise<Page<DestinationSummary>>;
  get(slug: string, options?: RequestOptions): Promise<Destination>;
  search(q: string, types?: SearchResultType[], options?: RequestOptions): Promise<SearchResponse>;
  communityChannels(destinationId: string): Promise<CommunityChannel[]>;
  communityPosts(channelId: string, cursor?: string): Promise<Page<CommunityPost>>;
  createCommunityPost(input: CommunityPostInput): Promise<CommunityPost>;
  toggleHelpful(postId: string): Promise<CommunityPost>;
}

export function createDestinationRepository(client: RepositoryClient): DestinationRepository {
  return {
    list: (query, options) =>
      client.get<PageDto<DestinationSummaryDto>>(endpoints.destinations.list, { ...query }, options),
    get: (slug, options) => client.get<DestinationDto>(endpoints.destinations.detail(slug), undefined, options),
    search: (q, types, options) =>
      client.get<SearchResponseDto>(endpoints.search, { q, types: types?.join(',') }, options),
    communityChannels: async (destinationId) =>
      (await client.get<{ items: CommunityChannelDto[] }>(endpoints.destinations.communityChannels(destinationId))).items,
    communityPosts: (channelId, cursor) =>
      client.get<PageDto<CommunityPostDto>>(endpoints.community.posts(channelId), { cursor }),
    createCommunityPost: (input) => client.post<CommunityPostDto>(endpoints.community.posts(input.channelId), input),
    toggleHelpful: (postId) => client.post<CommunityPostDto>(endpoints.community.helpful(postId)),
  };
}
