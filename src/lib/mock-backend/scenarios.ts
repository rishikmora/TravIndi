import type { AdaptationProposalDto } from '@/types/api';
import { emitCrowdProposal, publishSos } from './effects';
import { mockFlags, type MockFlags } from './flags';
import { broadcastMessage, runHousekeeping } from './handlers/shared';
import { newId, nowIso } from './http';
import { mockNetwork } from './network';
import type { RealtimeHub } from './realtime';
import { C } from './seed/ids';
import type { MessageRecord, MockStore } from './store';

/** Development triggers for states that are otherwise hard to reach by hand. */
export interface MockScenarios {
  readonly flags: MockFlags;
  setOffline(offline: boolean): void;
  /** Sends a crowd-change proposal for the given (or the signed-in user's active) trip. */
  triggerAdaptation(tripId?: string): AdaptationProposalDto | null;
  /** Another trip member types, then sends a message. */
  incomingMessage(conversationId?: string): void;
  /** Makes pending proposals expire now. */
  expirePendingProposals(): number;
  /** Ends the session server-side so the next request returns 401. */
  expireSession(): void;
  /** Acknowledges the signed-in user's open SOS alert. */
  acknowledgeSos(): boolean;
}

export function createScenarios(store: MockStore, hub: RealtimeHub): MockScenarios {
  return {
    flags: mockFlags,

    setOffline: (offline) => mockNetwork.setSimulatedOffline(offline),

    triggerAdaptation(tripId) {
      const userId = store.sessionUser?.user_id;
      const target = tripId ?? (userId ? store.tripsFor(userId).find((t) => t.status === 'active')?.trip_id : undefined);
      return target ? emitCrowdProposal(store, hub, target) : null;
    },

    incomingMessage(conversationId = C.tripHyd) {
      const conversation = store.conversation(conversationId);
      const userId = store.sessionUser?.user_id;
      const sender = conversation?.members.find((m) => m.user_id !== userId && store.user(m.user_id));
      if (!conversation || !sender) return;
      const channel = `conversation:${conversationId}` as const;
      hub.publish(channel, 'typing.started', { conversation_id: conversationId, user_id: sender.user_id, display_name: sender.display_name });
      setTimeout(() => {
        hub.publish(channel, 'typing.stopped', { conversation_id: conversationId, user_id: sender.user_id });
        const record: MessageRecord = {
          message_id: newId('msg'),
          conversation_id: conversationId,
          sender_id: sender.user_id,
          sender_name: sender.display_name,
          client_message_id: null,
          content: 'Just reached the entrance — where are you?',
          message_type: 'text',
          card: null,
          attachment: null,
          reply_to: null,
          created_at: nowIso(),
          edited_at: null,
          deleted_at: null,
          _reactions: {},
        };
        store.state.messages.push(record);
        conversation._read[sender.user_id] = record.message_id;
        conversation.updated_at = record.created_at;
        hub.publish(channel, 'message.created', { message: broadcastMessage(record) });
        store.persist();
      }, 2500);
    },

    expirePendingProposals() {
      const past = new Date(Date.now() - 1000).toISOString();
      const pending = store.state.proposals.filter((p) => p.status === 'proposed');
      pending.forEach((p) => (p.expires_at = past));
      runHousekeeping(store, hub);
      return pending.length;
    },

    expireSession: () => store.expireSession(),

    acknowledgeSos() {
      const userId = store.sessionUser?.user_id;
      const alert = store.state.sos.find((a) => a._owner_id === userId && a.status === 'received');
      if (!alert) return false;
      alert.status = 'acknowledged';
      alert.acknowledged_at = nowIso();
      alert.acknowledged_by_label = 'Operations Desk (demo)';
      publishSos(store, hub, alert);
      return true;
    },
  };
}
