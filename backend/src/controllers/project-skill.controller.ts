import { Response } from 'express';
import { projectSkillService } from '../di/container.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { ValidationError } from '../../domain/errors.js';
import { AuthRequest } from '../http/middlewares/auth.middleware.js';

export class ProjectSkillController {
  static getForDomain = asyncHandler(async (req: AuthRequest, res: Response) => {
    const domainId = req.query.domainId as string | undefined;
    if (!domainId) {
      throw new ValidationError('domainId es requerido');
    }
    res.json(projectSkillService.getForDomain(domainId, req.user!.userId));
  });

  static create = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(projectSkillService.create(req.body, req.user!.userId));
  });

  static delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    projectSkillService.delete(req.params.id);
    res.json({ success: true });
  });
}
