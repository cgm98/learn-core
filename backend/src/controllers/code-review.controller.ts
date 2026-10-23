import { Response } from 'express';
import { codeReviewService } from '../di/container.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { NotFoundError } from '../../domain/errors.js';
import { AuthRequest } from '../http/middlewares/auth.middleware.js';

export class CodeReviewController {
  static getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(codeReviewService.getAll(req.user!.userId));
  });

  static getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const item = codeReviewService.getById(req.params.id, req.user!.userId);
    if (!item) {
      throw new NotFoundError('Code review no encontrada');
    }
    res.json(item);
  });

  static create = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(codeReviewService.create(req.body, req.user!.userId));
  });

  static update = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(codeReviewService.update(req.params.id, req.body, req.user!.userId));
  });

  static delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    codeReviewService.delete(req.params.id, req.user!.userId);
    res.json({ success: true });
  });
}
