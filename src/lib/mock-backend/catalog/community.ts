import type { CommunityChannelDto, CommunityPostDto } from '@/types/api';

const CHANNELS: Array<Pick<CommunityChannelDto, 'slug' | 'name' | 'description'>> = [
  { slug: 'general', name: 'General', description: 'Planning questions and trip reports.' },
  { slug: 'food', name: 'Food', description: 'Where and what to eat, from street stalls to family kitchens.' },
  { slug: 'heritage', name: 'Heritage', description: 'Monuments, history and how to visit them well.' },
  { slug: 'events', name: 'Events', description: 'Festivals, walks and happenings.' },
  { slug: 'questions', name: 'Questions', description: 'Ask travellers and verified locals.' },
];

export function channelsFor(destinationId: string, posts: CommunityPostDto[]): CommunityChannelDto[] {
  return CHANNELS.map((channel) => {
    const channel_id = `ch_${destinationId}_${channel.slug}`;
    return {
      ...channel,
      channel_id,
      destination_id: destinationId,
      post_count: posts.filter((p) => p.channel_id === channel_id).length,
    };
  });
}

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

export function seedCommunityPosts(): CommunityPostDto[] {
  return [
    {
      post_id: 'post_hyd_1',
      channel_id: 'ch_dst_hyderabad_questions',
      author_name: 'Sanjana K.',
      author_badge: null,
      title: 'Visiting Charminar with elderly parents — best time of day?',
      body: 'My parents can walk short distances. Is the area manageable in the morning, and where can we sit nearby?',
      tags: ['accessibility', 'charminar'],
      created_at: ago(3),
      reply_count: 6,
      helpful_count: 14,
      marked_helpful_by_me: false,
    },
    {
      post_id: 'post_hyd_2',
      channel_id: 'ch_dst_hyderabad_food',
      author_name: 'Rukhsana Begum',
      author_badge: 'verified_guide',
      title: 'An easy Irani chai stop near Charminar',
      body: 'Go before 5 pm on weekdays for a table. Ask for Osmania biscuits fresh from the tin.',
      tags: ['irani chai', 'old city'],
      created_at: ago(6),
      reply_count: 11,
      helpful_count: 38,
      marked_helpful_by_me: false,
    },
    {
      post_id: 'post_hyd_3',
      channel_id: 'ch_dst_hyderabad_heritage',
      author_name: 'Imran S.',
      author_badge: 'local',
      title: 'Reminder: several museums close on Fridays',
      body: 'Plan Chowmahalla Palace and Salar Jung Museum on other days of the week.',
      tags: ['planning', 'museums'],
      created_at: ago(10),
      reply_count: 3,
      helpful_count: 52,
      marked_helpful_by_me: false,
    },
    {
      post_id: 'post_jai_1',
      channel_id: 'ch_dst_jaipur_heritage',
      author_name: 'Arjun Singh Rathore',
      author_badge: 'verified_guide',
      title: 'Amber Fort without the rush',
      body: 'Arrive at opening and see the Sheesh Mahal first; the ramparts are quieter late morning.',
      tags: ['amber fort'],
      created_at: ago(4),
      reply_count: 5,
      helpful_count: 27,
      marked_helpful_by_me: false,
    },
  ];
}
