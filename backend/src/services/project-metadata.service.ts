import { ProjectMetadata } from '../../domain/entities/project-metadata.entity.js';
import { IProjectMetadataRepository } from '../../domain/interfaces/project-metadata.repository.interface.js';
import { IDomainRepository } from '../../domain/interfaces/domain.repository.interface.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import { removeDomain } from '../../infrastructure/code-index/graph-writer.js';

export class ProjectMetadataService {
  constructor(
    private readonly projectMetadataRepository: IProjectMetadataRepository,
    private readonly domainRepository: IDomainRepository
  ) {}

  getAll(userId: string): ProjectMetadata[] {
    return this.projectMetadataRepository.getAll(userId);
  }

  getByDomainId(domainId: string, userId: string): ProjectMetadata | undefined {
    if (!this.domainRepository.findById(domainId, userId)) {
      return undefined;
    }
    return this.projectMetadataRepository.findByDomainId(domainId);
  }

  // Un proyecto sandbox ES un domain existente (ADR-003): no se autocrea el domain acá,
  // tiene que existir de antemano (mismo criterio que index-code.ts/watch-project.ts).
  create(data: { domain_id: string; local_path: string; watch_enabled?: boolean }, userId: string): ProjectMetadata {
    if (!this.domainRepository.findById(data.domain_id, userId)) {
      throw new ValidationError(`El domain "${data.domain_id}" no existe. Crealo primero (o usá uno existente).`);
    }
    if (this.projectMetadataRepository.findByDomainId(data.domain_id)) {
      throw new ValidationError(`El domain "${data.domain_id}" ya está registrado como proyecto sandbox.`);
    }

    const metadata: ProjectMetadata = {
      domain_id: data.domain_id,
      local_path: data.local_path,
      watch_enabled: data.watch_enabled ?? false,
      last_indexed_at: null,
      // Se llenan al primer indexado, no acá: registrar la rama sin haber indexado nada
      // afirmaría que el grafo describe ese commit, que es justo lo contrario.
      indexed_commit: null,
      indexed_branch: null,
      created_at: new Date().toISOString()
    };

    this.projectMetadataRepository.create(metadata);
    return metadata;
  }

  update(domainId: string, data: Partial<Pick<ProjectMetadata, 'local_path' | 'watch_enabled' | 'last_indexed_at'>>, userId: string): ProjectMetadata {
    if (!this.domainRepository.findById(domainId, userId)) {
      throw new NotFoundError('Proyecto sandbox no encontrado');
    }
    const existing = this.projectMetadataRepository.findByDomainId(domainId);
    if (!existing) {
      throw new NotFoundError('Proyecto sandbox no encontrado');
    }

    const updated: ProjectMetadata = {
      ...existing,
      local_path: data.local_path !== undefined ? data.local_path : existing.local_path,
      watch_enabled: data.watch_enabled !== undefined ? data.watch_enabled : existing.watch_enabled,
      last_indexed_at: data.last_indexed_at !== undefined ? data.last_indexed_at : existing.last_indexed_at
    };

    this.projectMetadataRepository.update(updated);
    return updated;
  }

  delete(domainId: string, userId: string): void {
    if (!this.domainRepository.findById(domainId, userId) || !this.projectMetadataRepository.findByDomainId(domainId)) {
      throw new NotFoundError('Proyecto sandbox no encontrado');
    }
    this.projectMetadataRepository.delete(domainId);
    // No borra el domain ni sus conceptos (eso lo hace TaxonomyManager aparte): solo el
    // grafo de código, que es puro derivado del scan y quedaría huérfano con este domain_id
    // muerto — exactamente lo que rompió el reindex de un domain nuevo sobre el mismo path.
    removeDomain(domainId);
  }
}
