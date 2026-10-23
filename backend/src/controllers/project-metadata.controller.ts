import { Response } from 'express';
import { projectMetadataService, codeIndexService, projectMetadataRepository, planService, domainService } from '../di/container.js';
import { asyncHandler } from '../http/middlewares/error-handler.js';
import { NotFoundError } from '../../domain/errors.js';
import { AuthRequest } from '../http/middlewares/auth.middleware.js';
import { provisionAgentBridge, initialPlanContent, ProvisionReport } from '../agent-bridge/provisioner.js';

// Prepara el repo del proyecto para trabajar con agente (flujo EJB CONTABLE 2026-08-03,
// automatizado): archivos del puente + plan inicial si el dominio no tiene ninguno. El
// plan se crea acá y no en el provisioner porque planService es quien valida
// dominio/usuario y emite plan.created para la timeline.
function runAgentBridge(localPath: string, domainId: string, userId: string): ProvisionReport {
  const domainName = domainService.getById(domainId, userId)?.name ?? domainId;
  const report = provisionAgentBridge(localPath, domainId, domainName);

  if (planService.getByDomain(domainId, userId).length === 0) {
    const { title, content } = initialPlanContent(domainId, domainName, localPath);
    planService.create({ domain_id: domainId, title, content, status: 'active' }, userId);
    report.steps.push({ item: 'plan', action: 'created', detail: `"${title}" activo — editalo en /projects.` });
  } else {
    report.steps.push({ item: 'plan', action: 'skipped', detail: 'El dominio ya tiene planes.' });
  }

  return report;
}

export class ProjectMetadataController {
  static getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(projectMetadataService.getAll(req.user!.userId));
  });

  static getByDomainId = asyncHandler(async (req: AuthRequest, res: Response) => {
    const item = projectMetadataService.getByDomainId(req.params.domainId, req.user!.userId);
    if (!item) {
      throw new NotFoundError('Proyecto sandbox no encontrado');
    }
    res.json(item);
  });

  // Al registrar, además de persistir, se aprovisiona el puente del agente en el repo
  // destino. Si eso falla (carpeta sin permisos, etc.) el registro NO se revierte: el
  // proyecto queda creado y el reporte lleva el error — se reintenta con /provision.
  static create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const created = projectMetadataService.create(req.body, req.user!.userId);

    let agentBridge: ProvisionReport;
    try {
      agentBridge = runAgentBridge(created.local_path, created.domain_id, req.user!.userId);
    } catch (err) {
      agentBridge = { steps: [], warnings: [`No se pudo configurar el puente del agente: ${err instanceof Error ? err.message : String(err)}`] };
    }

    res.status(201).json({ ...created, agentBridge });
  });

  // Re-ejecutable para proyectos registrados antes de esta automatización, o para
  // reparar (es idempotente: lo ya configurado se reporta como omitido).
  static provision = asyncHandler(async (req: AuthRequest, res: Response) => {
    const meta = projectMetadataService.getByDomainId(req.params.domainId, req.user!.userId);
    if (!meta) throw new NotFoundError('Proyecto sandbox no encontrado');
    res.json(runAgentBridge(meta.local_path, meta.domain_id, req.user!.userId));
  });

  // Prender/apagar el watcher es un efecto en caliente sobre este mismo proceso, no solo
  // una fila que cambia: si solo se persistiera, el estado real recién coincidiría con el
  // guardado tras reiniciar el server — justo la incoherencia que el indicador "vivo"
  // tiene que evitar. Un fallo al arrancarlo (p. ej. carpeta inexistente) no revierte el
  // guardado: queda persistido como habilitado y el estado lo reporta como error, que es
  // lo que deja ver el problema en vez de esconderlo.
  static update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const updated = projectMetadataService.update(req.params.domainId, req.body, req.user!.userId);

    if (req.body.watch_enabled !== undefined) {
      if (updated.watch_enabled) {
        try {
          codeIndexService.enableWatcher(updated.local_path, updated.domain_id);
          codeIndexService.recordIndexedGitState(projectMetadataRepository, updated.local_path, updated.domain_id);
        } catch (err) {
          return res.status(207).json({ ...updated, watcherError: err instanceof Error ? err.message : String(err) });
        }
      } else {
        await codeIndexService.disableWatcher(updated.domain_id);
      }
    }

    res.json(updated);
  });

  static delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    projectMetadataService.delete(req.params.domainId, req.user!.userId);
    res.json({ success: true });
  });
}
