import type { Metadata } from 'next';
import { OperationsScreen } from '@/components/authority/OperationsScreen';

export const metadata: Metadata = { title: 'Operations' };

export default function AuthorityPage() {
  return <OperationsScreen />;
}
