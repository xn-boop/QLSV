import type { Request } from 'express';
import type { AccessPrincipal } from '../../modules/auth/principal/access-principal.service';

export interface RequestWithId extends Request {
  id: string;
  principal?: AccessPrincipal;
}
