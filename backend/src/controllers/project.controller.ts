import { Response } from 'express';
import { projectService } from '../di/container.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { NotFoundError } from '../../domain/errors.js';
import { AuthRequest } from '../http/middlewares/auth.middleware.js';

export class ProjectController {
  static getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectService.getAll(req.user!.userId));
  });

  static getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const item = projectService.getById(req.params.id, req.user!.userId);
    if (!item) {
      throw new NotFoundError('Proyecto no encontrado');
    }
    res.json(item);
  });

  static create = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(projectService.create(req.body, req.user!.userId));
  });

  static getConcepts = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectService.getConcepts(req.params.id));
  });

  static linkConcept = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(projectService.linkConcept(req.params.id, req.body));
  });

  static unlinkConcept = asyncHandler(async (req: AuthRequest, res: Response) => {
    projectService.unlinkConcept(req.params.id, req.params.conceptId);
    res.json({ success: true });
  });

  static getExperiments = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectService.getExperiments(req.params.id));
  });

  static createExperiment = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(projectService.createExperiment(req.params.id, req.body));
  });

  static updateExperiment = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectService.updateExperiment(req.params.experimentId, req.body.status, req.body.outcome));
  });

  static getDecisions = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectService.getDecisions(req.params.id));
  });

  static createDecision = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.status(201).json(projectService.createDecision(req.params.id, req.body));
  });
}
