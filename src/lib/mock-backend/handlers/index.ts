import type { RouteDefinition } from '../router';
import { chatRoutes } from './chat';
import { commerceRoutes } from './commerce';
import { discoveryRoutes } from './discovery';
import { operationsRoutes } from './operations';
import { platformAuthRoutes } from './platform-auth';
import { safetyRoutes } from './safety';
import { tripRoutes } from './trips';

/** First match wins: within each domain, literal segments are declared before `:param` routes. */
export const routes: RouteDefinition[] = [
  ...platformAuthRoutes,
  ...discoveryRoutes,
  ...tripRoutes,
  ...safetyRoutes,
  ...chatRoutes,
  ...commerceRoutes,
  ...operationsRoutes,
];
