import { Response } from 'express';
import { projectActivityService } from '../di/container.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { ValidationError } from '../../domain/errors.js';
import { AuthRequest } from '../http/middlewares/auth.middleware.js';

export class ProjectActivityController {
  static getForDomain = asyncHandler(async (req: AuthRequest, res: Response) => {
    const domainId = req.query.domainId as string | undefined;
    if (!domainId) {
      throw new ValidationError('domainId es requerido');
    }
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(projectActivityService.getForDomain(domainId, req.user!.userId, limit));
  });
}
